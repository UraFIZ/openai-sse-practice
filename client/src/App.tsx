import React, { useState, useRef, useEffect } from 'react';

function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ttft, setTtft] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);
  
  // THE FIX: Store the abort controller so we can cancel requests
  const abortControllerRef = useRef<AbortController | null>(null);
  const responseEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response]);

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(); // This triggers req.on('close') on the backend!
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResponse('');
    setTtft(null);
    setTotalTime(null);

    // Setup new abort controller for this request
    abortControllerRef.current = new AbortController();
    const startTime = Date.now();
    let isFirstToken = true;

    try {
      const res = await fetch('http://localhost:5001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ prompt }),
        signal: abortControllerRef.current.signal, // Attach the abort signal to the fetch
      });

      if (!res.ok) throw new Error('Network response was not ok');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      if (!reader) throw new Error('Failed to read stream');

      let buffer = '';

      const getEventBoundary = (value: string) => {
        const lfIndex = value.indexOf('\n\n');
        const crlfIndex = value.indexOf('\r\n\r\n');

        if (lfIndex === -1 && crlfIndex === -1) {
          return null;
        }

        if (lfIndex === -1) {
          return { index: crlfIndex, length: 4 };
        }

        if (crlfIndex === -1) {
          return { index: lfIndex, length: 2 };
        }

        return lfIndex < crlfIndex
          ? { index: lfIndex, length: 2 }
          : { index: crlfIndex, length: 4 };
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let boundary = getEventBoundary(buffer);
        while (boundary) {
          const eventString = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary.length);

          const dataLines = eventString
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => {
              let value = line.substring(5);
              if (value.startsWith(' ')) {
                value = value.substring(1);
              }
              return value;
            });

          const dataStr = dataLines.join('\n');
          if (dataStr === '[DONE]') {
            setTotalTime(Date.now() - startTime);
            boundary = getEventBoundary(buffer);
            continue;
          }

          if (dataStr) {
            try {
              const parsedData = JSON.parse(dataStr);

              if (isFirstToken && parsedData.text) {
                setTtft(Date.now() - startTime);
                isFirstToken = false;
              }

              if (parsedData.text) {
                setResponse((prev) => prev + parsedData.text);
              }
            } catch (err) {
              console.error('Ignored incomplete JSON chunk', err);
            }
          }

          boundary = getEventBoundary(buffer);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
      if (err.name === 'AbortError') {
        setResponse((prev) => prev + '\n\n[Generation stopped by user]');
      } else {
        console.error(err);
        setResponse((prev) => prev + '\n\n[Error: Connection interrupted]');
      }
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      if (!totalTime && !isFirstToken) {
        setTotalTime(Date.now() - startTime);
      }
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '50px auto', fontFamily: 'sans-serif', paddingBottom: '100px' }}>
      <h1>Enterprise Streaming Chat (SSE)</h1>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask for a long response to test the Stop button..."
          rows={4}
          style={{ padding: '10px', fontSize: '16px', borderRadius: '4px' }}
        />
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            type="submit" 
            disabled={isLoading}
            style={{ flex: 1, padding: '10px', fontSize: '16px', backgroundColor: isLoading ? '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer' }}
          >
            {isLoading ? 'Streaming...' : 'Send Request'}
          </button>
          
          {/* THE FIX: The Abort Button */}
          {isLoading && (
            <button 
              type="button" 
              onClick={handleAbort}
              style={{ padding: '10px 20px', fontSize: '16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Stop
            </button>
          )}
        </div>
      </form>

      {/* Metrics Dashboard */}
      {(ttft !== null || totalTime !== null) && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '20px', padding: '15px', backgroundColor: '#e9ecef', borderRadius: '8px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#555', textTransform: 'uppercase' }}>Time to First Token</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>{ttft ? `${(ttft / 1000).toFixed(2)}s` : '...'}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#555', textTransform: 'uppercase' }}>Total Generation Time</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>{totalTime ? `${(totalTime / 1000).toFixed(2)}s` : '...'}</div>
          </div>
        </div>
      )}

      {/* The Chat UI */}
      {response && (
        <div style={{ 
          marginTop: '20px', 
          padding: '20px', 
          backgroundColor: '#1e1e1e', 
          color: '#d4d4d4', 
          borderRadius: '8px', 
          whiteSpace: 'pre-wrap', 
          lineHeight: '1.6',
          fontSize: '16px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          {response}
          {isLoading && (
            <span style={{ 
              display: 'inline-block', 
              width: '8px', 
              height: '18px', 
              backgroundColor: '#d4d4d4', 
              marginLeft: '4px', 
              verticalAlign: 'middle',
              animation: 'blink 1s step-end infinite' 
            }} />
          )}
          <div ref={responseEndRef} />
        </div>
      )}

      <style>
        {`
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}
      </style>
    </div>
  );
}

export default App;