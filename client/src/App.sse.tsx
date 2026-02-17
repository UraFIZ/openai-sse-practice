import React, { useState, useRef, useEffect } from 'react';

function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Timers
  const [ttft, setTtft] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);

  // Ref for auto-scrolling to the bottom of the chat
  const responseEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll effect whenever the response changes
  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResponse('');
    setTtft(null);
    setTotalTime(null);

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
      });

      if (!res.ok) throw new Error('Network response was not ok');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      if (!reader) throw new Error('Failed to read stream');

      // THE FIX: We use a buffer to hold incomplete network chunks
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Add the new raw bytes to our string buffer
        buffer += decoder.decode(value, { stream: true });
        
        // SSE chunks are separated by double newlines. 
        const events = buffer.split('\n\n');
        
        // The last item in the array might be an incomplete chunk, 
        // so we pop it off and keep it in the buffer for the next loop.
        buffer = events.pop() || ''; 

        for (const event of events) {
          const line = event.trim();
          
          if (line.startsWith('data:')) {
            // Extract the actual JSON string
            const dataStr = line.substring(5).trim();
            
            if (dataStr === '[DONE]') {
              setTotalTime(Date.now() - startTime);
              continue; 
            }

            try {
              const parsedData = JSON.parse(dataStr);
              
              if (isFirstToken && parsedData.text) {
                setTtft(Date.now() - startTime);
                isFirstToken = false;
              }

              // Append the new text safely
              setResponse((prev) => prev + parsedData.text);
            } catch (err) {
              console.error('Ignored incomplete JSON chunk', err);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
      if (!totalTime && !isFirstToken) {
        setTotalTime(Date.now() - startTime);
      }
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '50px auto', fontFamily: 'sans-serif', paddingBottom: '100px' }}>
      <h1>Pro Streaming Chat (SSE)</h1>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask for a long response (e.g., 'Write a 500-word story about a hacker')..."
          rows={4}
          style={{ padding: '10px', fontSize: '16px', borderRadius: '4px' }}
        />
        <button 
          type="submit" 
          disabled={isLoading}
          style={{ padding: '10px', fontSize: '16px', backgroundColor: isLoading ? '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer' }}
        >
          {isLoading ? 'Generating...' : 'Send Request'}
        </button>
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
          backgroundColor: '#1e1e1e', // Dark mode background
          color: '#d4d4d4', // Light gray text
          borderRadius: '8px', 
          whiteSpace: 'pre-wrap', 
          lineHeight: '1.6',
          fontSize: '16px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          {response}
          {/* The Blinking Cursor Effect */}
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
          <div ref={responseEndRef} /> {/* Invisible div for auto-scrolling */}
        </div>
      )}

      {/* Inject CSS animation for the cursor */}
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