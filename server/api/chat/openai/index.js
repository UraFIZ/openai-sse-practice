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

const startCompletionStream = async (prompt) => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use your desired model
      max_tokens: 1024,
      stream: true, // Enable streaming
      messages: [{ role: 'user', content: prompt }],
    });
    console.log('Stream started:', response);
    // response.data.on('data', (chunk) => {
    //   console.log('Received chunk:', chunk);
    // })
  }

startCompletionStream('Cars are amazing because')

app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // 1. Strict Anti-Buffering Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders(); 

  // 2. Setup AbortController
  const abortController = new AbortController();

  req.on('close', () => {
    console.log('Client disconnected. Aborting generation...');
    abortController.abort(); 
  });

  try {
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
        
        if (res.flush) {
          res.flush();
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
    console.log('OpenAI Stream complete.');

  } catch (error) {
    const errorName = error?.name;
    const errorMessage = error?.message || '';
    const isAbort = errorName === 'AbortError' || errorName === 'APIUserAbortError' || errorMessage.includes('aborted');

    if (isAbort) {
      console.log('Stream aborted by client.');
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