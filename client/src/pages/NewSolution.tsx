import React, { useCallback, useEffect, useRef, useState } from 'react';

type StreamMetrics = {
  ttftMs: number | null;
  totalMs: number | null;
};

type ParsedSse = {
  dataEvents: string[];
  rest: string;
};

// Controls how "smooth" text appears (characters per frame and frame interval).
const RENDER_CONFIG = {
  charsPerTick: 3,
  tickMs: 28,
};

// Parse complete SSE frames from a growing string buffer.
function parseSseEvents(buffer: string): ParsedSse {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const frames = normalized.split('\n\n');
  const rest = frames.pop() ?? '';
  const dataEvents: string[] = [];

  for (const frame of frames) {
    // Skip heartbeats/comments/empty frames.
    if (!frame.trim() || frame.startsWith(':')) {
      continue;
    }

    // Collect multiline `data:` payloads into one logical event string.
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (data) {
      dataEvents.push(data);
    }
  }

  return { dataEvents, rest };
}

function NewSolution() {
  const [message, setMessage] = useState('Explain SSE streaming in one paragraph.');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<StreamMetrics>({ ttftMs: null, totalMs: null });

  const responseEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Queue stores raw streamed text before it is rendered smoothly.
  const renderQueueRef = useRef('');
  const renderTimerRef = useRef<number | null>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Stops the incremental render loop.
  const stopRenderLoop = useCallback(() => {
    if (renderTimerRef.current !== null) {
      window.clearInterval(renderTimerRef.current);
      renderTimerRef.current = null;
    }
  }, []);

  // Adds new streamed text into the rendering queue.
  const enqueueForRender = useCallback((nextChunk: string) => {
    renderQueueRef.current += nextChunk;
  }, []);

  // Starts smooth UI rendering from queue -> response state in small steps.
  const startRenderLoop = useCallback(() => {
    if (renderTimerRef.current !== null) {
      return;
    }

    renderTimerRef.current = window.setInterval(() => {
      const queue = renderQueueRef.current;
      if (!queue) {
        return;
      }

      const nextPart = queue.slice(0, RENDER_CONFIG.charsPerTick);
      renderQueueRef.current = queue.slice(RENDER_CONFIG.charsPerTick);
      setResponse((prev) => prev + nextPart);
    }, RENDER_CONFIG.tickMs);
  }, []);

  // Flushes remaining queued text instantly (used on finish/error/stop).
  const flushRenderQueue = useCallback(() => {
    const pending = renderQueueRef.current;
    if (pending) {
      setResponse((prev) => prev + pending);
      renderQueueRef.current = '';
    }
  }, []);

  const resetRenderState = useCallback(() => {
    stopRenderLoop();
    renderQueueRef.current = '';
  }, [stopRenderLoop]);

  const stopStream = useCallback(() => {
    // Abort pending network stream.
    abortRef.current?.abort();
    abortRef.current = null;

    // Finish rendering already buffered text and stop loading state.
    flushRenderQueue();
    stopRenderLoop();
    setIsLoading(false);
  }, [flushRenderQueue, stopRenderLoop]);

  const startStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      return;
    }

    // Stop any previous stream and reset render pipeline.
    stopStream();
    resetRenderState();

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setResponse('');
    setMetrics({ ttftMs: null, totalMs: null });
    startRenderLoop();

    const startedAt = Date.now();
    let hasFirstToken = false;

    try {
      // Start POST request and ask server for SSE response.
      const res = await fetch('/api/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          message,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('ReadableStream is not available in this browser context.');
      }

      // Read chunks from fetch stream and decode UTF-8 bytes incrementally.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const part = await reader.read();
        done = part.done;

        if (!part.value) {
          continue;
        }

        // Append decoded text to parser buffer and extract full SSE events.
        buffer += decoder.decode(part.value, { stream: true });
        const { dataEvents, rest } = parseSseEvents(buffer);
        buffer = rest;

        for (const eventData of dataEvents) {
          if (eventData === '[DONE]') {
            done = true;
            break;
          }

          try {
            const parsed = JSON.parse(eventData) as { value?: string; error?: string };
            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (!parsed.value) {
              continue;
            }

            // Capture time-to-first-token once.
            if (!hasFirstToken) {
              hasFirstToken = true;
              setMetrics((prev) => ({ ...prev, ttftMs: Date.now() - startedAt }));
            }

            // Enqueue new text; UI loop renders it smoothly.
            enqueueForRender(parsed.value);
          } catch (parseError) {
            console.error('Malformed SSE payload', parseError);
          }
        }
      }

      // Ensure final characters are rendered and finalize timing.
      flushRenderQueue();
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

      stopRenderLoop();
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '760px', margin: '30px auto', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
      <h1>OpenAI fetch() + POST + SSE</h1>
      <p style={{ color: '#555' }}>
        Uses fetch POST with JSON body and reads <code>text/event-stream</code> incrementally from
        <code>ReadableStream</code> with smooth token rendering.
      </p>

      <form onSubmit={startStream} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your prompt"
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
            lineHeight: '1.7',
            fontSize: '16px',
            letterSpacing: '0.1px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            border: '1px solid rgba(255,255,255,0.06)',
            transition: 'all 180ms ease',
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
