import { useEffect, useSyncExternalStore } from 'react';

type StreamCallbacks = {
  onFirstToken?: () => void;
  onDone?: () => void;
  onError?: () => void;
};

const subscribers = new Set<() => void>();
let responseText = '';
let eventSource: EventSource | null = null;

const notify = () => {
  subscribers.forEach((callback) => callback());
};

const subscribe = (callback: () => void) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};

const getSnapshot = () => responseText;

const setResponse = (next: string) => {
  responseText = next;
  notify();
};

const appendResponse = (next: string) => {
  responseText += next;
  notify();
};

const stopStream = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
};

const startStream = (prompt: string, callbacks: StreamCallbacks = {}) => {
  stopStream();
  setResponse('');

  let sawFirstToken = false;
  const url = `/api/events?prompt=${encodeURIComponent(prompt)}`;
  eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    const dataStr = event.data;
    if (dataStr === '[DONE]') {
      stopStream();
      callbacks.onDone?.();
      return;
    }

    try {
      const { text } = JSON.parse(dataStr) as { text: string };
      if (text) {
        if (!sawFirstToken) {
          sawFirstToken = true;
          callbacks.onFirstToken?.();
        }
        appendResponse(text);
      }
    } catch {
      // Ignore malformed JSON chunk
    }
  };

  eventSource.onerror = () => {
    stopStream();
    callbacks.onError?.();
  };
};

export const useSseStream = () => {
  const response = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => () => stopStream(), []);

  return {
    response,
    startStream,
    stopStream,
    appendResponse,
    setResponse,
  };
};
