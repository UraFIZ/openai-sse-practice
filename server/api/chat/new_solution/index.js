import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const words = [
  'This',
  'is',
  'a',
  'simple',
  'fetch-event-source',
  'stream',
  'sending',
  'one',
  'word',
  'every',
  'two',
  'seconds.',
];

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
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let index = 0;
  const timer = setInterval(() => {
    if (index >= words.length) {
      res.write('data: [DONE]\n\n');
      clearInterval(timer);
      res.end();
      return;
    }

    const payload = JSON.stringify({ value: words[index] + ' ' });
    console.log(`Sending chunk: ${payload}`);
    res.write(`data: ${payload}\n\n`);
    index += 1;
  }, 2000);

  // req.on('close', () => {
  //   clearInterval(timer);
  //   res.end();
  // });
});

app.listen(port, () => {
  console.log(`[new_solution] Server running on http://localhost:${port}`);
});
