import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * ChatStream uses EventEmitter to decouple the Anthropic SDK stream
 * from the HTTP response writer.
 *
 * Producer: reads from Anthropic's streaming API, emits 'chunk' events.
 * Consumer: the Express route handler listens and writes SSE to the response.
 *
 * This separation makes it easy to:
 *  - abort cleanly when the client disconnects
 *  - test the streaming logic without an HTTP layer
 *  - swap the AI provider without changing the HTTP handler
 */
class ChatStream extends EventEmitter {
  #aborted = false;

  constructor(client, prompt) {
    super();
    this.#run(client, prompt);
  }

  abort() {
    this.#aborted = true;
    this.removeAllListeners();
  }

  async #run(client, prompt) {
    try {
      const stream = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      });

      for await (const chunk of stream) {
        if (this.#aborted) break;
        if (chunk.type === 'content_block_delta' && chunk.delta.text) {
          this.emit('chunk', chunk.delta.text);
        }
      }

      if (!this.#aborted) {
        this.emit('done');
      }
    } catch (err) {
      if (!this.#aborted) {
        this.emit('error', err);
      }
    }
  }
}

/**
 * POST /api/stream
 *
 * Unlike the SSE/index.js solution (GET with EventSource), this uses POST.
 * Advantage: the prompt travels in the request body, not the query string.
 * No URL length limits, no prompt leaking into server logs/browser history.
 *
 * The client reads the response using fetch + ReadableStream (not EventSource),
 * which gives chunk-by-chunk rendering with POST support and AbortController.
 */
app.post('/api/stream', (req, res) => {
  const { prompt } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // These three headers are what make SSE work:
  // - text/event-stream tells the browser not to buffer the response
  // - no-cache prevents intermediary caches from holding chunks
  // - keep-alive keeps the TCP connection open
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // flushHeaders() sends the headers immediately, before any body data.
  // Without this, Express may buffer the headers until the first res.write().
  res.flushHeaders();

  const chatStream = new ChatStream(anthropic, prompt);

  chatStream.on('chunk', (text) => {
    // Each SSE event: "data: <json>\n\n"
    // The double newline is the event delimiter that the client parser looks for.
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
  });

  chatStream.on('done', () => {
    res.write('data: [DONE]\n\n');
    res.end();
  });

  chatStream.on('error', (err) => {
    console.error('ChatStream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream failed' });
    } else {
      res.end();
    }
  });

  // Detect client disconnection (closed tab, aborted fetch).
  //
  // IMPORTANT: req.on('close') is WRONG here. The request is a Readable
  // stream — its 'close' fires when the request BODY is fully consumed.
  // Since express.json() already parsed the POST body before this handler
  // runs, req 'close' fires immediately. That's why it was aborting instantly.
  //
  // res.on('close') is correct. The response is a Writable stream — its
  // 'close' fires when the connection is actually terminated, either by
  // res.end() (normal) or by the client disconnecting (premature).
  res.on('close', () => {
    if (!res.writableFinished) {
      chatStream.abort();
    }
  });
});

app.listen(port, () => {
  console.log(`[new_solution] Server running on http://localhost:${port}`);
});
