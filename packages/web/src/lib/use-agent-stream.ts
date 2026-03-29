'use client';

import { useState, useCallback } from 'react';
import { type TimelineEntry } from '@/components/ResearchTrace';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timeline?: TimelineEntry[];
}

interface StreamState {
  /** Full text received so far (reasoning + separator + answer) */
  fullText: string;
  /** Whether we've seen the --- separator yet */
  pastSeparator: boolean;
  /** Text before the separator (reasoning) */
  reasoningText: string;
  /** Text after the separator (answer) */
  answerText: string;
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
}

export function useAgentStream(): UseAgentStreamReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [liveTimeline, setLiveTimeline] = useState<TimelineEntry[]>([]);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingAnswer, setStreamingAnswer] = useState('');

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setIsLoading(true);
    setLiveTimeline([]);
    setStreamingReasoning('');
    setStreamingAnswer('');

    try {
      const mastraUrl = process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111';
      const res = await fetch(`${mastraUrl}/api/agents/ncMedicaidAgent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: question }],
          maxSteps: 15,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const timeline: TimelineEntry[] = [];
      const activeTools = new Map<string, string>();

      // Stream state
      let fullText = '';
      let pastSeparator = false;
      let pendingReasoningText = ''; // text accumulated since last tool call
      let answerText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case 'tool-call-input-streaming-start': {
                // Flush any pending reasoning text before this tool call
                if (pendingReasoningText.trim()) {
                  timeline.push({ type: 'reasoning', text: pendingReasoningText.trim() });
                  pendingReasoningText = '';
                }
                const name = event.payload?.toolName || 'unknown';
                activeTools.set(event.payload?.toolCallId, name);
                timeline.push({ type: 'tool', name, status: 'running' });
                setLiveTimeline([...timeline]);
                break;
              }

              case 'tool-result': {
                const toolCallId = event.payload?.toolCallId;
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
                const text = event.payload?.text || '';
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
          } catch {
            // Skip malformed JSON
          }
        }
      }

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
  }, [isLoading]);

  return { messages, isLoading, liveTimeline, streamingReasoning, streamingAnswer, sendMessage };
}
