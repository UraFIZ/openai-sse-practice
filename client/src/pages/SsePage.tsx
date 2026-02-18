import React, { useEffect, useRef, useState } from 'react';
import { useSseStream } from '../hooks/useSseStream';

function SsePage() {
  const [prompt, setPrompt] = useState('');
  const { response, startStream, stopStream, appendResponse } = useSseStream();
  const [isLoading, setIsLoading] = useState(false);
  const [ttft, setTtft] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);
  const responseEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response]);

  const handleAbort = () => {
    stopStream();
    setIsLoading(false);
    appendResponse('\n\n[Generation stopped by user]');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setTtft(null);
    setTotalTime(null);

    const startTime = Date.now();

    startStream(prompt, {
      onFirstToken: () => {
        setTtft(Date.now() - startTime);
      },
      onDone: () => {
        setTotalTime(Date.now() - startTime);
        setIsLoading(false);
      },
      onError: () => {
        setIsLoading(false);
        appendResponse('\n\n[Error: Connection interrupted]');
      },
    });
  };

  return (
    <div style={{ maxWidth: '680px', margin: '30px auto', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
      <h1>SSE Streaming Chat</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask for a long response to see streaming in action..."
          rows={4}
          style={{ padding: '10px', fontSize: '16px', borderRadius: '4px' }}
        />

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '16px',
              backgroundColor: isLoading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Streaming...' : 'Send'}
          </button>

          {isLoading && (
            <button
              type="button"
              onClick={handleAbort}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Stop
            </button>
          )}
        </div>
      </form>

      {(ttft !== null || totalTime !== null) && (
        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            gap: '20px',
            padding: '15px',
            backgroundColor: '#e9ecef',
            borderRadius: '8px',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: '#555', textTransform: 'uppercase' }}>Time to First Token</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
              {ttft != null ? `${(ttft / 1000).toFixed(2)}s` : '...'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#555', textTransform: 'uppercase' }}>Total Generation Time</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
              {totalTime != null ? `${(totalTime / 1000).toFixed(2)}s` : '...'}
            </div>
          </div>
        </div>
      )}

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
          {isLoading && (
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '18px',
                backgroundColor: '#d4d4d4',
                marginLeft: '4px',
                verticalAlign: 'middle',
                animation: 'blink 1s step-end infinite',
              }}
            />
          )}
          <div ref={responseEndRef} />
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default SsePage;
