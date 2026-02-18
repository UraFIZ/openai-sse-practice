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
  'fetch-based',
  'SSE',
  'stream',
  'that',
  'renders',
  'word',
  'by',
  'word.',
];

app.post('/api/stream', (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'identity');
  res.flushHeaders();

  // Helps some clients/proxies start forwarding immediately.
  res.write(': stream-start\n\n');

  let closed = false;
  let index = 0;

  const timer = setInterval(() => {
    if (closed) {
      return;
    }

    if (index >= words.length) {
      res.write('data: [DONE]\n\n');
      clearInterval(timer);
      res.end();
      return;
    }

    const payload = JSON.stringify({ value: `${words[index]} ` });
    res.write(`data: ${payload}\n\n`);
    index += 1;
  }, 600);

  const cleanup = () => {
    closed = true;
    clearInterval(timer);
  };

  req.on('aborted', cleanup);
  res.on('close', cleanup);
});

app.listen(port, () => {
  console.log(`[new_solution] Server running on http://localhost:${port}`);
});
