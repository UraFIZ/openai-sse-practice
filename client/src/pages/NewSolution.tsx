import React, { useEffect, useRef, useState } from 'react';

/**
 * NewSolution — streams AI responses using fetch + ReadableStream.
 *
 * How this differs from SsePage (which uses EventSource):
 *
 * EventSource (SsePage):
 *   - GET only — prompt must go in the query string (URL length limits, visible in logs)
 *   - Browser parses SSE format automatically, fires onmessage per event
 *   - Auto-reconnects on failure (not always desirable)
 *
 * fetch + ReadableStream (this page):
 *   - POST — prompt goes in the request body (no length limit, not in logs)
 *   - We parse SSE format manually from the raw byte stream
 *   - AbortController gives precise cancellation control
 *
 * KEY INSIGHT: fetch() resolves when HEADERS arrive, not when the body is done.
 * response.body is a ReadableStream. Calling reader.read() in a loop yields
 * chunks as they arrive from the network — this is what enables real-time rendering.
 *
 * If you instead called `await response.text()` or `await response.json()`,
 * those methods buffer the ENTIRE body before resolving — that's why naive
 * fetch appears to "wait until the end".
 */
function NewSolution() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ttft, setTtft] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const responseEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response]);

  const handleAbort = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setResponse((prev) => prev + '\n\n[Generation stopped by user]');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResponse('');
    setTtft(null);
    setTotalTime(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const startTime = Date.now();
    let isFirstToken = true;

    try {
      // fetch() resolves as soon as the response HEADERS arrive.
      // The body has not been read yet — it's a ReadableStream.
      const res = await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // response.body is a ReadableStream of Uint8Array chunks.
      // getReader() locks the stream and gives us a pull-based reader.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // Network chunks don't align with SSE event boundaries.
      // A single chunk might contain half an event, or multiple events.
      // We buffer incomplete data between read() calls.
      let buffer = '';

      while (true) {
        // reader.read() resolves when the NEXT chunk arrives from the network.
        // It does NOT wait for the full response. This is why we get
        // real-time, chunk-by-chunk rendering.
        const { done, value } = await reader.read();
        if (done) break;

        // Decode raw bytes to string. { stream: true } handles multi-byte
        // characters (like emoji) that might be split across chunks.
        buffer += decoder.decode(value, { stream: true });

        // SSE events are delimited by double newlines.
        const parts = buffer.split('\n\n');
        // The last element may be incomplete — keep it for the next iteration.
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;

          const dataStr = line.slice(5).trim();

          if (dataStr === '[DONE]') {
            setTotalTime(Date.now() - startTime);
            continue;
          }

          try {
            const { text } = JSON.parse(dataStr);
            if (text) {
              if (isFirstToken) {
                setTtft(Date.now() - startTime);
                isFirstToken = false;
              }
              setResponse((prev) => prev + text);
            }
          } catch {
            // Skip malformed JSON — a chunk boundary may have split a line
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setResponse((prev) => prev + '\n\n[Error: Connection failed]');
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <div style={{ maxWidth: '680px', margin: '30px auto', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
      <h1>fetch + ReadableStream + EventEmitter</h1>
      <p style={{ color: '#666', marginTop: '-8px', marginBottom: '16px' }}>
        POST request · server uses EventEmitter · client reads ReadableStream chunk by chunk
      </p>

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

export default NewSolution;
