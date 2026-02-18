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

app.get('/api/events', async (req, res) => {
  const prompt = typeof req.query.prompt === 'string' ? req.query.prompt : '';

  if (!prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
  });

  try {
    console.log(`Received prompt: "${prompt}", starting OpenAI stream...`);
    const stream = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      },
      {
        signal: abortController.signal,
      }
    );

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        const payload = JSON.stringify({ text: content });
        res.write(`data: ${payload}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    const errorName = error?.name;
    const errorMessage = error?.message || '';
    const isAbort = errorName === 'AbortError' || errorName === 'APIUserAbortError' || errorMessage.includes('aborted');

    if (isAbort) {
      return;
    }

    console.error('OpenAI Stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate response' });
    } else {
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});