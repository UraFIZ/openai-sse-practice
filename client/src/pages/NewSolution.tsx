import React, { useEffect, useRef, useState } from 'react';

type StreamMetrics = {
  ttftMs: number | null;
  totalMs: number | null;
};

function parseSseEvents(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const frames = normalized.split('\n\n');
  const rest = frames.pop() ?? '';

  const events: string[] = [];

  for (const frame of frames) {
    if (!frame.trim()) {
      continue;
    }

    const dataLines = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length > 0) {
      events.push(dataLines.join('\n'));
    }
  }

  return { events, rest };
}

function NewSolution() {
  const [prompt, setPrompt] = useState('demo');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<StreamMetrics>({ ttftMs: null, totalMs: null });

  const responseEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stopStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  };

  const startStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    stopStream();

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setResponse('');
    setMetrics({ ttftMs: null, totalMs: null });

    const startedAt = Date.now();
    let sawFirstToken = false;

    try {
      const res = await fetch('/api/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: 'demo-model',
          message: prompt,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('Response body is not streamable in this browser/runtime.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let done = false;

      while (!done) {
        const readResult = await reader.read();
        done = readResult.done;

        if (readResult.value) {
          buffer += decoder.decode(readResult.value, { stream: true });
          const { events, rest } = parseSseEvents(buffer);
          buffer = rest;

          for (const eventData of events) {
            if (eventData === '[DONE]') {
              done = true;
              break;
            }

            try {
              const parsed = JSON.parse(eventData) as { value?: string };
              if (parsed.value) {
                if (!sawFirstToken) {
                  sawFirstToken = true;
                  setMetrics((prev) => ({ ...prev, ttftMs: Date.now() - startedAt }));
                }
                setResponse((prev) => prev + parsed.value);
              }
            } catch {
              // Ignore malformed event payloads.
            }
          }
        }
      }

      setMetrics((prev) => ({ ...prev, totalMs: Date.now() - startedAt }));
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error(error);
        setResponse('[Error: stream interrupted]');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '760px', margin: '30px auto', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
      <h1>POST + fetch() + SSE stream parser</h1>
      <p style={{ color: '#555' }}>
        This page uses <code>fetch</code> (POST JSON body) and parses <code>text/event-stream</code> manually from
        <code>ReadableStream</code> chunks.
      </p>

      <form onSubmit={startStream} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt"
          rows={3}
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
            {isLoading ? 'Streaming...' : 'Start stream'}
          </button>

          {isLoading && (
            <button
              type="button"
              onClick={stopStream}
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

      <div style={{ marginTop: '12px', fontSize: '14px', color: '#444' }}>
        TTFT: {metrics.ttftMs == null ? '—' : `${metrics.ttftMs} ms`} • Total:{' '}
        {metrics.totalMs == null ? '—' : `${metrics.totalMs} ms`}
      </div>

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
          {isLoading ? <span style={{ opacity: 0.8 }}>▍</span> : null}
          <div ref={responseEndRef} />
        </div>
      )}
    </div>
  );
}

export default NewSolution;
