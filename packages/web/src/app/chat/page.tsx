'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, toolStatus]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setToolStatus('Researching...');

    try {
      const mastraUrl = process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111';
      const res = await fetch(`${mastraUrl}/api/agents/ncMedicaidAgent/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: input }], maxSteps: 20 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.text || 'No response generated.',
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Agent error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your question. Please try again.',
      }]);
    } finally {
      setIsLoading(false);
      setToolStatus(null);
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
        {messages.length === 0 && (
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
                  onClick={() => { setInput(q); }}
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
            <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-900'
            }`}>
              <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
            </div>
          </div>
        ))}

        {toolStatus && (
          <div className="flex justify-start">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800 animate-pulse">
              {toolStatus}
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
