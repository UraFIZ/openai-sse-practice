import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── How SSE works ────────────────────────────────────────────────────────────
//
//  SSE (Server-Sent Events) is a one-way channel: server → client.
//  The wire format is plain text:
//
//    data: <payload>\n\n        ← a single event
//    data: <payload>\n\n        ← the next event
//    data: [DONE]\n\n           ← our custom end-of-stream sentinel
//
//  Rules:
//   • Content-Type MUST be "text/event-stream"
//   • Each event ends with a blank line (\n\n)
//   • Lines that start with "data:" carry the payload
//   • The server must NOT buffer — it must flush each write immediately
//
// ─────────────────────────────────────────────────────────────────────────────

const streamPrompt = async (res, prompt) => {
  try {
    console.log(`Streaming prompt: "${prompt}"...`);

    // ── 1. Set SSE headers ──────────────────────────────────────────────────
    // These headers turn a normal HTTP response into an SSE stream.
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform'); // 'no-transform' stops proxies from compressing
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Tells Nginx NOT to buffer this response
    res.setHeader('Transfer-Encoding', 'chunked');

    // Flush the headers to the client immediately so it knows a stream is coming.
    // Without this, some runtimes hold the headers until the first write().
    res.flushHeaders();

    if (res.socket) {
      res.socket.setNoDelay(true);
    }

    // Send a padding comment to push data through browser/proxy buffers.
    res.write(': ' + 'x'.repeat(2048) + '\n\n');

    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    res.on('close', () => {
      clearInterval(keepAlive);
      res.end();
    });

    const writeSse = (data) => {
      res.write(`data: ${data}\n\n`);
      if (typeof res.flush === 'function') {
        res.flush();
      }
    };

    // ── 2. Ask Claude for a streaming response ──────────────────────────────
    // stream: true makes the SDK return an AsyncIterable instead of waiting
    // for the full response. Each iteration yields one chunk from Claude.
    const stream = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    // ── 3. Forward each chunk to the client as an SSE event ─────────────────
    for await (const chunk of stream) {
      // The Anthropic SDK emits several event types; we only care about
      // 'content_block_delta' which carries the actual text tokens.
      if (chunk.type === 'content_block_delta' && chunk.delta.text) {
        // Serialize the token as JSON so the client can parse it safely,
        // then wrap it in the SSE wire format:  data: <json>\n\n
        const payload = JSON.stringify({ text: chunk.delta.text });
        writeSse(payload);
      }
    }

    // ── 4. Signal end-of-stream ─────────────────────────────────────────────
    // [DONE] is not part of the SSE spec — it's a convention (popularised by
    // OpenAI) that tells the client "no more events are coming".
    writeSse('[DONE]');
    clearInterval(keepAlive);
    res.end();
    console.log('Stream complete.');

  } catch (error) {
    console.error('Anthropic API Error:', error);
    if (!res.headersSent) {
      // Headers not sent yet — can still send a normal JSON error
      res.status(500).json({ error: 'Failed to generate response' });
    } else {
      // Headers already sent (stream started) — just close the connection
      res.end();
    }
  }
};

app.get('/api/events', async (req, res) => {
  const prompt = typeof req.query.prompt === 'string' ? req.query.prompt : '';

  if (!prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  await streamPrompt(res, prompt);
});

app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  await streamPrompt(res, prompt);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
