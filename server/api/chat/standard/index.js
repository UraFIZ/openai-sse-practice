import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Anthropic Client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Ensure this is set in your .env file
});

// Traditional, non-streaming chat endpoint
app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    console.log(`Received prompt: "${prompt}", waiting for Claude...`);
    
    // Block and wait for Claude to generate the entire response
    const msg = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', 
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = msg.content[0].text;
    console.log('Response fully generated. Sending to client.');
    
    // Send the complete response back to the React app
    res.json({ response: responseText });

  } catch (error) {
    console.error('Anthropic API Error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});