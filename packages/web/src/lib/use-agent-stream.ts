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
      let currentStepText = '';
      let currentStepHasTools = false;
      let finalAnswerText = '';
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
              case 'step-start': {
                // Previous step completed — classify its text
                if (currentStepText.trim()) {
                  if (currentStepHasTools) {
                    // Already pushed to timeline by tool-call-input-streaming-start
                  } else {
                    // No tools in that step — it was final answer text
                    finalAnswerText += currentStepText;
                    setStreamingText(finalAnswerText);
                  }
                }
                currentStepText = '';
                currentStepHasTools = false;
                break;
              }

              case 'tool-call-input-streaming-start': {
                // Any buffered text before this tool call is reasoning
                if (currentStepText.trim()) {
                  timeline.push({ type: 'reasoning', text: currentStepText.trim() });
                  currentStepText = '';
                }
                currentStepHasTools = true;
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
                currentStepText += text;

                if (currentStepHasTools) {
                  // During a tool step — this is reasoning, show in timeline
                  setLiveTimeline([...timeline, { type: 'reasoning', text: currentStepText.trim() }]);
                }
                // If no tools yet, DON'T show as answer — we don't know
                // if a tool call is coming. Wait for step-start to confirm.
                // Exception: if we already have finalAnswerText, this step
                // is continuing the answer (multi-step answer generation).
                if (!currentStepHasTools && finalAnswerText) {
                  setStreamingText(finalAnswerText + currentStepText);
                }
                break;
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Flush last step
      if (currentStepText.trim()) {
        if (currentStepHasTools) {
          timeline.push({ type: 'reasoning', text: currentStepText.trim() });
        } else {
          finalAnswerText += currentStepText;
        }
      }

      const content = finalAnswerText.trim() || 'No response generated.';
      setStreamingText('');
      setLiveTimeline([]);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content,
        timeline: timeline.length > 0 ? timeline.map(e =>
          e.type === 'tool' ? { ...e, status: 'done' as const } : e
        ) : undefined,
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
