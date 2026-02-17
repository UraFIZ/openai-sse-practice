import React, { useState, useRef, useEffect } from 'react';

function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ttft, setTtft] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const responseEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response]);

  const handleAbort = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResponse('');
    setTtft(null);
    setTotalTime(null);

    abortControllerRef.current = new AbortController();
    const startTime = Date.now();
    let isFirstToken = true;

    try {
      // Step 1: POST the prompt — the server responds with Content-Type: text/event-stream
      // We do NOT use the native EventSource API because it only supports GET.
      // Instead we use fetch() and read the response body as a stream manually.
      const res = await fetch('http://localhost:5001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

      // Step 2: Get a low-level reader and a UTF-8 decoder
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // Step 3: The SSE protocol sends events separated by a blank line (\n\n).
      //   Each event looks like:
      //     data: {"text":"Hello"}\n\n
      //
      // Network packets don't respect event boundaries — a single read() call
      // may return half an event or multiple events at once.
      // We use a string buffer to accumulate bytes until we have complete events.
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append newly decoded bytes to the buffer
        buffer += decoder.decode(value, { stream: true });

        // Split on the SSE event boundary (double newline).
        // The last element might be an *incomplete* event, so we pop it back
        // into the buffer and only process the confirmed-complete ones.
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const line = event.trim();

          // SSE lines that carry payload start with "data:"
          if (!line.startsWith('data:')) continue;

          // Slice off the "data:" prefix (5 chars) and any leading space
          const dataStr = line.slice(5).trim();

          // Step 4: Check for our custom end-of-stream sentinel
          if (dataStr === '[DONE]') {
            setTotalTime(Date.now() - startTime);
            continue;
          }

          // Step 5: Parse the JSON payload and append the text chunk to the UI
          try {
            const { text } = JSON.parse(dataStr) as { text: string };
            if (text) {
              if (isFirstToken) {
                setTtft(Date.now() - startTime); // Time to First Token
                isFirstToken = false;
              }
              // React batches these setState calls, but each chunk still
              // triggers a re-render so the user sees text appear word-by-word.
              setResponse((prev) => prev + text);
            }
          } catch {
            // A malformed JSON chunk — safe to ignore
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setResponse((prev) => prev + '\n\n[Generation stopped by user]');
      } else {
        console.error(err);
        setResponse((prev) => prev + '\n\n[Error: Connection interrupted]');
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '50px auto', fontFamily: 'sans-serif', paddingBottom: '100px' }}>
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
              flex: 1, padding: '10px', fontSize: '16px',
              backgroundColor: isLoading ? '#ccc' : '#007bff',
              color: 'white', border: 'none', borderRadius: '4px',
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
                padding: '10px 20px', fontSize: '16px',
                backgroundColor: '#dc3545', color: 'white',
                border: 'none', borderRadius: '4px', cursor: 'pointer',
              }}
            >
              Stop
            </button>
          )}
        </div>
      </form>

      {/* Metrics */}
      {(ttft !== null || totalTime !== null) && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '20px', padding: '15px', backgroundColor: '#e9ecef', borderRadius: '8px' }}>
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

      {/* Response area */}
      {response && (
        <div style={{
          marginTop: '20px', padding: '20px',
          backgroundColor: '#1e1e1e', color: '#d4d4d4',
          borderRadius: '8px', whiteSpace: 'pre-wrap',
          lineHeight: '1.6', fontSize: '16px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}>
          {response}
          {isLoading && (
            <span style={{
              display: 'inline-block', width: '8px', height: '18px',
              backgroundColor: '#d4d4d4', marginLeft: '4px',
              verticalAlign: 'middle', animation: 'blink 1s step-end infinite',
            }} />
          )}
          <div ref={responseEndRef} />
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default App;
