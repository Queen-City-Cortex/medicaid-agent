'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChunkType } from '@mastra/core/stream';
import { type TimelineEntry } from '@/components/ResearchTrace';
import { mastraClient } from './mastra-client';
import { parseMessageContent } from './parse-message';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timeline?: TimelineEntry[];
}

const AGENT_ID = 'nc-medicaid-navigator';

interface UseAgentStreamOptions {
  threadId: string;
  resourceId: string;
  onComplete?: () => void;
}

interface UseAgentStreamReturn {
  messages: Message[];
  isLoading: boolean;
  streamText: string;
  streamTimeline: TimelineEntry[];
  sendMessage: (question: string) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  loadThread: (threadId: string) => Promise<void>;
}

export function useAgentStream({ threadId, resourceId, onComplete }: UseAgentStreamOptions): UseAgentStreamReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamTimeline, setStreamTimeline] = useState<TimelineEntry[]>([]);

  // Refs to avoid stale closures in the stream callback
  const streamTextRef = useRef('');
  const timelineRef = useRef<TimelineEntry[]>([]);

  const loadThread = useCallback(async (tid: string) => {
    try {
      const thread = mastraClient.getMemoryThread({ threadId: tid, agentId: AGENT_ID });
      const result = await thread.listMessages();
      const dbMessages = result.messages ?? [];

      const converted: Message[] = [];
      for (const msg of dbMessages) {
        const role = msg.role as 'user' | 'assistant' | string;
        if (role !== 'user' && role !== 'assistant') continue;

        const content = parseMessageContent(msg.content as unknown);
        if (!content.trim()) continue;

        converted.push({ role: role as 'user' | 'assistant', content: content.trim() });
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

    // Reset stream state
    streamTextRef.current = '';
    timelineRef.current = [];
    setStreamText('');
    setStreamTimeline([]);

    try {
      const agent = mastraClient.getAgent(AGENT_ID);

      const response = await agent.stream(
        [{ role: 'user', content: question }],
        {
          maxSteps: 15,
          memory: {
            thread: threadId,
            resource: resourceId,
          },
        },
      );

      await response.processDataStream({
        onChunk: async (chunk: ChunkType) => {
          const timeline = timelineRef.current;

          switch (chunk.type) {
            case 'text-delta': {
              streamTextRef.current += chunk.payload?.text || '';
              setStreamText(streamTextRef.current);
              break;
            }

            case 'tool-call-input-streaming-start': {
              // Flush accumulated text as a reasoning entry
              if (streamTextRef.current.trim()) {
                timeline.push({ type: 'reasoning', text: streamTextRef.current.trim() });
                streamTextRef.current = '';
                setStreamText('');
              }
              // Add running tool entry
              const name = chunk.payload?.toolName || 'unknown';
              timeline.push({ type: 'tool', name, status: 'running' });
              setStreamTimeline([...timeline]);
              break;
            }

            case 'tool-result': {
              // Mark the most recent matching running tool as done
              const toolName = chunk.payload?.toolName || 'unknown';
              for (let j = timeline.length - 1; j >= 0; j--) {
                const entry = timeline[j];
                if (entry.type === 'tool' && entry.name === toolName && entry.status === 'running') {
                  timeline[j] = { ...entry, status: 'done' };
                  break;
                }
              }
              setStreamTimeline([...timeline]);
              break;
            }
          }
        },
      });

      // Build the completed message
      const finalText = streamTextRef.current.trim();
      const finalTimeline = timelineRef.current.map(e =>
        e.type === 'tool' ? { ...e, status: 'done' as const } : e
      );

      const msg: Message = {
        role: 'assistant',
        content: finalText || 'No response generated.',
        timeline: finalTimeline.length > 0 ? finalTimeline : undefined,
      };

      // Clear live stream state, add completed message
      setStreamText('');
      setStreamTimeline([]);
      streamTextRef.current = '';
      timelineRef.current = [];
      setMessages(prev => [...prev, msg]);

      onComplete?.();
    } catch (error) {
      console.error('Agent error:', error);
      setStreamText('');
      setStreamTimeline([]);
      streamTextRef.current = '';
      timelineRef.current = [];
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your question. Please try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, threadId, resourceId, onComplete]);

  return { messages, isLoading, streamText, streamTimeline, sendMessage, setMessages, loadThread };
}
