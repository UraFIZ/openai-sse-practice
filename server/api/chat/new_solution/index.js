import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/api/stream', async (req, res) => {
  const model = typeof req.body?.model === 'string' ? req.body.model : 'gpt-4o-mini';
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  const shouldStream = req.body?.stream !== false;

  if (!message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!shouldStream) {
    return res.status(400).json({ error: 'stream must be true for this endpoint' });
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'identity');
  res.flushHeaders();

  // Comment line is valid SSE and can help some proxies begin forwarding quickly.
  res.write(': stream-start\n\n');

  const abortController = new AbortController();
  let streamFinished = false;

  const cleanup = () => {
    if (!streamFinished && !abortController.signal.aborted) {
      abortController.abort();
    }
  };

  // Do NOT use req.on('close') here for POST streaming:
  // Node emits 'close' on IncomingMessage when request body reading is complete,
  // which can happen right after submit and would abort generation too early.
  req.on('aborted', cleanup);
  res.on('close', cleanup);

  try {
    const stream = await openai.chat.completions.create(
      {
        model,
        messages: [{ role: 'user', content: message }],
        stream: true,
      },
      { signal: abortController.signal }
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (!text) {
        continue;
      }

      const payload = JSON.stringify({ value: text });
      res.write(`data: ${payload}\n\n`);
    }

    streamFinished = true;
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const messageText = error instanceof Error ? error.message : '';
    const wasAborted = name === 'AbortError' || name === 'APIUserAbortError' || messageText.includes('aborted');

    if (wasAborted) {
      return;
    }

    console.error('[new_solution] OpenAI stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate response' });
    } else {
      res.write('event: error\n');
      res.write('data: {"error":"stream_failed"}\n\n');
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`[new_solution] Server running on http://localhost:${port}`);
});
