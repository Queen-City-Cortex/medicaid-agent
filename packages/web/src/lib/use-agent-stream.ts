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

      // Stream state: track reasoning vs answer via --- separator
      let fullText = '';
      let pastSeparator = false;
      let reasoningText = '';
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

                // Check for separator in the accumulated text
                if (!pastSeparator) {
                  // Look for --- in the full text (may arrive across chunks)
                  const sepMatch = fullText.match(/\n?---\n/);
                  if (sepMatch && sepMatch.index !== undefined) {
                    pastSeparator = true;
                    reasoningText = fullText.slice(0, sepMatch.index).trim();
                    answerText = fullText.slice(sepMatch.index + sepMatch[0].length);
                    setStreamingReasoning(reasoningText);
                    setStreamingAnswer(answerText);
                  } else {
                    // Still in reasoning phase
                    reasoningText = fullText.trim();
                    setStreamingReasoning(reasoningText);
                  }
                } else {
                  // Past separator — accumulate answer
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

      // Finalize
      const finalTimeline: TimelineEntry[] = timeline.map(e =>
        e.type === 'tool' ? { ...e, status: 'done' as const } : e
      );

      // If we have reasoning text, add it to timeline
      if (reasoningText.trim()) {
        // Split reasoning into sentences for cleaner display
        const sentences = reasoningText
          .split(/(?<=\.)\s+/)
          .filter(s => s.trim())
          .map(s => ({ type: 'reasoning' as const, text: s.trim() }));
        // Interleave: put reasoning sentences around tool calls chronologically
        // Simple approach: just prepend all reasoning before tools
        finalTimeline.unshift(...sentences);
      }

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
