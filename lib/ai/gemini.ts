import { GoogleGenAI } from '@google/genai';

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not set in the environment variables.");
}

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});
