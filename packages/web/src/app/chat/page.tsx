'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// A single entry in the research timeline — either reasoning text or a tool call
type TimelineEntry =
  | { type: 'reasoning'; text: string }
  | { type: 'tool'; name: string; status: 'running' | 'done' };

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timeline?: TimelineEntry[];
}

const TOOL_LABELS: Record<string, string> = {
  searchSections: 'Searching policy sections',
  getSection: 'Reading section content',
  getDocument: 'Loading document structure',
  getSectionContext: 'Checking section hierarchy',
  followReferences: 'Following cross-references',
  getAmendments: 'Checking for amendments',
  findConceptSections: 'Finding related concepts',
  lookupPolicy: 'Looking up policy',
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [liveTimeline, setLiveTimeline] = useState<TimelineEntry[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveTimeline, streamingText]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const question = input;
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setInput('');
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
                // Flush previous step's text
                if (currentStepText.trim()) {
                  if (currentStepHasTools) {
                    // This step had tools — text was reasoning
                    // (already pushed to timeline by tool-call-input-streaming-start)
                  } else {
                    // No tools — this was final answer text
                    finalAnswerText += currentStepText;
                    setStreamingText(finalAnswerText);
                  }
                }
                currentStepText = '';
                currentStepHasTools = false;
                break;
              }

              case 'tool-call-input-streaming-start': {
                // This step has a tool call — any text so far is reasoning, not answer
                if (currentStepText.trim()) {
                  timeline.push({ type: 'reasoning', text: currentStepText.trim() });
                  currentStepText = '';
                  // Clear the optimistic streaming text since it was reasoning
                  setStreamingText(finalAnswerText);
                  setLiveTimeline([...timeline]);
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
                // Mark the tool as done in the timeline
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
                // If this step already has tools, it's reasoning (shown in timeline)
                // If no tools yet, optimistically show as streaming answer
                // (will be reclassified at step-start if tools appear later)
                if (!currentStepHasTools) {
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

      // Flush the last step's text
      if (currentStepText.trim()) {
        if (currentStepHasTools) {
          timeline.push({ type: 'reasoning', text: currentStepText.trim() });
        } else {
          finalAnswerText += currentStepText;
        }
      }

      const content = finalAnswerText.trim() || 'No response generated.';

      // Clear live state and add completed message
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
  };

  const renderTimeline = (timeline: TimelineEntry[], live: boolean) => (
    <div className="space-y-1.5">
      {timeline.map((entry, i) => {
        if (entry.type === 'tool') {
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              {entry.status === 'running' && live ? (
                <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              ) : (
                <span className="text-green-500 flex-shrink-0">&#10003;</span>
              )}
              <span className={entry.status === 'done' || !live ? 'text-gray-500' : 'text-gray-700'}>
                {TOOL_LABELS[entry.name] || entry.name}
              </span>
            </div>
          );
        } else {
          return (
            <p key={i} className="text-xs text-gray-400 italic pl-6">
              {entry.text}
            </p>
          );
        }
      })}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">NC Medicaid Navigator</h1>
        <p className="text-sm text-gray-500">Ask questions about NC Medicaid policy</p>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-lg">Ask a question about NC Medicaid policy</p>
            <p className="text-sm mt-2">Examples:</p>
            <div className="mt-3 space-y-2">
              {[
                'Does NC Medicaid cover chiropractic services?',
                'What is the earned income limit for HCWD?',
                'How many days of therapeutic leave does Medicaid allow for nursing facility residents?',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => setInput(q)}
                  className="block mx-auto text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${msg.role === 'user' ? '' : 'space-y-2'}`}>
              {msg.role === 'user' && (
                <div className="bg-blue-600 text-white rounded-lg px-4 py-3">
                  <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                </div>
              )}

              {msg.role === 'assistant' && (
                <>
                  {msg.timeline && msg.timeline.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5">
                        <span className="group-open:rotate-90 transition-transform inline-block">&#9654;</span>
                        {msg.timeline.filter(e => e.type === 'tool').length} tools used &middot; click to see research process
                      </summary>
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        {renderTimeline(msg.timeline, false)}
                      </div>
                    </details>
                  )}

                  <div className="bg-white border border-gray-200 text-gray-900 rounded-lg px-4 py-3 prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Live research panel */}
        {liveTimeline.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%]">
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                {renderTimeline(liveTimeline, true)}
              </div>
            </div>
          </div>
        )}

        {/* Streaming final answer */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-white border border-gray-200 rounded-lg px-4 py-3 prose prose-sm max-w-none">
              <ReactMarkdown>{streamingText}</ReactMarkdown>
              <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="bg-white border-t px-6 py-4">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask about NC Medicaid policy..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Researching...' : 'Ask'}
          </button>
        </div>
      </footer>
    </div>
  );
}
