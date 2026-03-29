'use client';

import { useState, useRef, useEffect } from 'react';

interface ToolCall {
  name: string;
  status: 'running' | 'done';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
  reasoning?: string[];  // intermediate reasoning steps
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
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [currentReasoning, setCurrentReasoning] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, toolCalls, streamingText]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const question = input;
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setInput('');
    setIsLoading(true);
    setToolCalls([]);
    setStreamingText('');
    setCurrentReasoning('');

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

      // Track text per step — only the LAST step's text is the final answer
      let stepTexts: string[] = [];      // text collected per step
      let currentStepText = '';
      let currentStepHasTools = false;
      let allToolNames: string[] = [];
      let reasoningSteps: string[] = [];
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
                // Save previous step's text as reasoning if it had tool calls
                if (currentStepText.trim() && currentStepHasTools) {
                  reasoningSteps.push(currentStepText.trim());
                  setCurrentReasoning(prev => {
                    const steps = [...reasoningSteps];
                    return steps.join('\n');
                  });
                }
                currentStepText = '';
                currentStepHasTools = false;
                break;
              }

              case 'tool-call-input-streaming-start': {
                currentStepHasTools = true;
                const name = event.payload?.toolName || 'unknown';
                activeTools.set(event.payload?.toolCallId, name);
                if (!allToolNames.includes(name)) allToolNames.push(name);
                setToolCalls(prev => {
                  if (prev.some(t => t.name === name && t.status === 'running')) return prev;
                  return [...prev, { name, status: 'running' }];
                });
                break;
              }

              case 'tool-result': {
                const toolCallId = event.payload?.toolCallId;
                const name = activeTools.get(toolCallId) || 'unknown';
                activeTools.delete(toolCallId);
                setToolCalls(prev =>
                  prev.map(t => t.name === name && t.status === 'running'
                    ? { ...t, status: 'done' }
                    : t
                  )
                );
                break;
              }

              case 'text-delta': {
                const text = event.payload?.text || '';
                currentStepText += text;
                // Only show streaming text for non-tool steps (likely the final answer)
                if (!currentStepHasTools) {
                  setStreamingText(currentStepText);
                } else {
                  setCurrentReasoning([...reasoningSteps, currentStepText.trim()].join('\n'));
                }
                break;
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Determine final answer: the last step's text (if it had no tools) is the answer
      // If the last step also had tools, concatenate all non-tool text as the answer
      let finalAnswer = '';
      if (!currentStepHasTools && currentStepText.trim()) {
        finalAnswer = currentStepText.trim();
      } else {
        // All steps had tools — use the last step's text
        finalAnswer = currentStepText.trim() || 'No response generated.';
      }

      // Finalize
      setToolCalls(prev => {
        const tools = prev.map(t => t.name);
        setMessages(msgs => [...msgs, {
          role: 'assistant',
          content: finalAnswer,
          tools,
          reasoning: reasoningSteps.length > 0 ? reasoningSteps : undefined,
        }]);
        return [];
      });
      setStreamingText('');
      setCurrentReasoning('');

    } catch (error) {
      console.error('Agent error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your question. Please try again.',
      }]);
      setToolCalls([]);
      setStreamingText('');
      setCurrentReasoning('');
    } finally {
      setIsLoading(false);
    }
  };

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
              {/* User message */}
              {msg.role === 'user' && (
                <div className="bg-blue-600 text-white rounded-lg px-4 py-3">
                  <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                </div>
              )}

              {/* Assistant message */}
              {msg.role === 'assistant' && (
                <>
                  {/* Tool calls + reasoning (collapsible) */}
                  {(msg.tools?.length || msg.reasoning?.length) && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5">
                        <span className="group-open:rotate-90 transition-transform">&#9654;</span>
                        {msg.tools?.length || 0} tools used &middot; click to see research process
                      </summary>
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-1.5">
                        {/* Tool badges */}
                        <div className="flex flex-wrap gap-1.5">
                          {msg.tools?.map((tool, j) => (
                            <span key={j} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded">
                              <span className="text-green-500">&#10003;</span>
                              {TOOL_LABELS[tool] || tool}
                            </span>
                          ))}
                        </div>
                        {/* Reasoning steps */}
                        {msg.reasoning && msg.reasoning.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-gray-500 italic border-t border-gray-200 pt-2">
                            {msg.reasoning.map((r, j) => (
                              <p key={j}>{r}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  )}

                  {/* Answer */}
                  <div className="bg-white border border-gray-200 text-gray-900 rounded-lg px-4 py-3">
                    <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Live tool call status */}
        {toolCalls.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] space-y-2">
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 space-y-1.5">
                {toolCalls.map((tc, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {tc.status === 'running' ? (
                      <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span className="text-green-600">&#10003;</span>
                    )}
                    <span className={tc.status === 'done' ? 'text-gray-400' : 'text-gray-700'}>
                      {TOOL_LABELS[tc.name] || tc.name}
                    </span>
                  </div>
                ))}
                {/* Live reasoning text */}
                {currentReasoning && (
                  <div className="text-xs text-gray-400 italic border-t border-gray-100 pt-1.5 mt-1.5">
                    {currentReasoning.split('\n').slice(-2).map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Streaming final answer text */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="whitespace-pre-wrap text-sm text-gray-900">{streamingText}</div>
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
