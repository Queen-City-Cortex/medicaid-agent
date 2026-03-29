'use client';

import { useState, useCallback } from 'react';
import { type TimelineEntry } from '@/components/ResearchTrace';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timeline?: TimelineEntry[];
}

interface UseAgentStreamReturn {
  messages: Message[];
  isLoading: boolean;
  liveTimeline: TimelineEntry[];
  streamingText: string;
  sendMessage: (question: string) => Promise<void>;
}

export function useAgentStream(): UseAgentStreamReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [liveTimeline, setLiveTimeline] = useState<TimelineEntry[]>([]);
  const [streamingText, setStreamingText] = useState('');

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setIsLoading(true);
    setLiveTimeline([]);
    setStreamingText('');

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
      let fullText = '';
      const activeTools = new Map<string, string>();

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
                setStreamingText(fullText);
                break;
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Split at --- separator: everything before is reasoning, after is answer
      const raw = fullText.trim() || 'No response generated.';
      const separatorIndex = raw.lastIndexOf('\n---\n');
      let reasoning: string | undefined;
      let content: string;

      if (separatorIndex !== -1) {
        reasoning = raw.slice(0, separatorIndex).trim();
        content = raw.slice(separatorIndex + 5).trim(); // skip \n---\n
      } else {
        // No separator — try splitting at just ---
        const altIndex = raw.lastIndexOf('---');
        if (altIndex > 0 && altIndex < raw.length - 3) {
          reasoning = raw.slice(0, altIndex).trim();
          content = raw.slice(altIndex + 3).trim();
        } else {
          content = raw;
        }
      }

      // Build final timeline: tool calls (from stream) + reasoning (from pre-separator text)
      const finalTimeline: TimelineEntry[] = timeline.map(e =>
        e.type === 'tool' ? { ...e, status: 'done' as const } : e
      );
      if (reasoning) {
        // Add reasoning as a single entry at the top of the timeline
        finalTimeline.unshift({ type: 'reasoning', text: reasoning });
      }

      setStreamingText('');
      setLiveTimeline([]);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: content || 'No response generated.',
        timeline: finalTimeline.length > 0 ? finalTimeline : undefined,
      }]);

    } catch (error) {
      console.error('Agent error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your question. Please try again.',
      }]);
      setLiveTimeline([]);
      setStreamingText('');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  return { messages, isLoading, liveTimeline, streamingText, sendMessage };
}
