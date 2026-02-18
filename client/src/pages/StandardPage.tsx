import React, { useEffect, useRef, useState } from 'react';

function StandardPage() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const responseEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResponse('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

      const data = (await res.json()) as { response?: string };
      setResponse(data.response ?? '');
    } catch (err) {
      console.error(err);
      setResponse('[Error: Connection interrupted]');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '680px', margin: '30px auto', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
      <h1>Standard Response Chat</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask something and wait for the full response..."
          rows={4}
          style={{ padding: '10px', fontSize: '16px', borderRadius: '4px' }}
        />

        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: '10px',
            fontSize: '16px',
            backgroundColor: isLoading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Waiting...' : 'Send'}
        </button>
      </form>

      {response && (
        <div
          style={{
            marginTop: '20px',
            padding: '20px',
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: '8px',
            whiteSpace: 'pre-wrap',
            lineHeight: '1.6',
            fontSize: '16px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          }}
        >
          {response}
          <div ref={responseEndRef} />
        </div>
      )}
    </div>
  );
}

export default StandardPage;
