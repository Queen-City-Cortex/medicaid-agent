'use client';

import { useState, useCallback } from 'react';
import type { ChunkType } from '@mastra/core/stream';
import { type TimelineEntry } from '@/components/ResearchTrace';
import { mastraClient } from './mastra-client';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timeline?: TimelineEntry[];
}

const AGENT_ID = 'nc-medicaid-navigator';
const RESOURCE_ID = 'anonymous';

interface UseAgentStreamOptions {
  threadId: string;
}

interface UseAgentStreamReturn {
  messages: Message[];
  isLoading: boolean;
  liveTimeline: TimelineEntry[];
  /** Reasoning text streaming before the separator */
  streamingReasoning: string;
  /** Answer text streaming after the separator */
  streamingAnswer: string;
  sendMessage: (question: string) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  loadThread: (threadId: string) => Promise<void>;
}

export function useAgentStream({ threadId }: UseAgentStreamOptions): UseAgentStreamReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [liveTimeline, setLiveTimeline] = useState<TimelineEntry[]>([]);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingAnswer, setStreamingAnswer] = useState('');

  /** Load historical messages from Mastra memory for a given threadId */
  const loadThread = useCallback(async (tid: string) => {
    try {
      const thread = mastraClient.getMemoryThread({ threadId: tid, agentId: AGENT_ID });
      const result = await thread.listMessages();
      const dbMessages = result.messages ?? [];

      // Convert Mastra DB messages to our Message format
      // Filter to only user/assistant messages with text content
      const converted: Message[] = [];
      for (const msg of dbMessages) {
        const role = msg.role as 'user' | 'assistant' | string;
        if (role !== 'user' && role !== 'assistant') continue;

        let content = '';
        const rawContent = msg.content as unknown;
        if (typeof rawContent === 'string') {
          content = rawContent;
        } else if (Array.isArray(rawContent)) {
          for (const part of rawContent) {
            if (typeof part === 'string') {
              content += part;
            } else if (part && typeof part === 'object' && 'text' in part) {
              content += (part as { text: string }).text;
            }
          }
        } else if (rawContent && typeof rawContent === 'object' && 'parts' in rawContent) {
          // Mastra v2 format: { format: 2, parts: [{ type: 'text', text: '...' }, ...] }
          const parts = (rawContent as { parts: Array<{ type: string; text?: string }> }).parts;
          for (const part of parts) {
            if (part.type === 'text' && part.text) {
              content += part.text;
            }
          }
        }

        if (!content.trim()) continue;

        // For assistant messages, strip any reasoning section (before ---)
        if (role === 'assistant') {
          const sepMatch = content.match(/\n?---\n?/);
          if (sepMatch && sepMatch.index !== undefined) {
            content = content.slice(sepMatch.index + sepMatch[0].length).trim();
          }
        }

        if (content.trim()) {
          converted.push({ role: role as 'user' | 'assistant', content: content.trim() });
        }
      }

      setMessages(converted);
    } catch (err) {
      console.error('Failed to load thread messages:', err);
      setMessages([]);
    }
  }, []);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setIsLoading(true);
    setLiveTimeline([]);
    setStreamingReasoning('');
    setStreamingAnswer('');

    try {
      const agent = mastraClient.getAgent(AGENT_ID);

      const response = await agent.stream(
        [{ role: 'user', content: question }],
        {
          maxSteps: 15,
          memory: {
            thread: threadId,
            resource: RESOURCE_ID,
          },
        },
      );

      const timeline: TimelineEntry[] = [];
      const activeTools = new Map<string, string>();

      // Stream state
      let fullText = '';
      let pastSeparator = false;
      let pendingReasoningText = '';
      let answerText = '';

      await response.processDataStream({
        onChunk: async (chunk: ChunkType) => {
          switch (chunk.type) {
            case 'tool-call-input-streaming-start': {
              if (pendingReasoningText.trim()) {
                timeline.push({ type: 'reasoning', text: pendingReasoningText.trim() });
                pendingReasoningText = '';
              }
              const name = chunk.payload?.toolName || 'unknown';
              const toolCallId = chunk.payload?.toolCallId;
              activeTools.set(toolCallId, name);
              timeline.push({ type: 'tool', name, status: 'running' });
              setLiveTimeline([...timeline]);
              break;
            }

            case 'tool-result': {
              const toolCallId = chunk.payload?.toolCallId;
              const name = activeTools.get(toolCallId) || 'unknown';
              activeTools.delete(toolCallId);
              for (let j = timeline.length - 1; j >= 0; j--) {
                const entry = timeline[j];
                if (entry.type === 'tool' && entry.name === name && entry.status === 'running') {
                  timeline[j] = { ...entry, status: 'done' };
                  break;
                }
              }
              setLiveTimeline([...timeline]);
              break;
            }

            case 'text-delta': {
              const text = chunk.payload?.text || '';
              fullText += text;

              if (!pastSeparator) {
                pendingReasoningText += text;

                // Check for --- separator (with or without trailing newline)
                const sepMatch = fullText.match(/\n?---\n?/);
                if (sepMatch && sepMatch.index !== undefined) {
                  pastSeparator = true;
                  // Flush reasoning (strip ---) before switching to answer
                  const cleanedReasoning = pendingReasoningText.replace(/\n?---\n?.*$/, '').trim();
                  if (cleanedReasoning) {
                    timeline.push({ type: 'reasoning', text: cleanedReasoning });
                  }
                  pendingReasoningText = '';
                  setLiveTimeline([...timeline]);
                  answerText = fullText.slice(sepMatch.index + sepMatch[0].length);
                  setStreamingReasoning('');
                  setStreamingAnswer(answerText);
                } else {
                  // Still in reasoning — update live view (strip any trailing ---)
                  const displayText = pendingReasoningText.replace(/-{1,3}$/, '').trim();
                  setStreamingReasoning(displayText);
                  setLiveTimeline([...timeline, ...(displayText
                    ? [{ type: 'reasoning' as const, text: displayText }]
                    : []
                  )]);
                }
              } else {
                answerText += text;
                setStreamingAnswer(answerText);
              }
              break;
            }
          }
        },
      });

      // Finalize — flush any remaining pending reasoning
      if (pendingReasoningText.trim() && !pastSeparator) {
        timeline.push({ type: 'reasoning', text: pendingReasoningText.trim() });
      }

      const finalTimeline: TimelineEntry[] = timeline.map(e =>
        e.type === 'tool' ? { ...e, status: 'done' as const } : e
      );

      const content = (answerText || fullText).trim() || 'No response generated.';

      setStreamingReasoning('');
      setStreamingAnswer('');
      setLiveTimeline([]);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content,
        timeline: finalTimeline.length > 0 ? finalTimeline : undefined,
      }]);

    } catch (error) {
      console.error('Agent error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your question. Please try again.',
      }]);
      setLiveTimeline([]);
      setStreamingReasoning('');
      setStreamingAnswer('');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, threadId]);

  return { messages, isLoading, liveTimeline, streamingReasoning, streamingAnswer, sendMessage, setMessages, loadThread };
}
