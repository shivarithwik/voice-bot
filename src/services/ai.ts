
import { GoogleGenAI } from "@google/genai";

// Standard initialization as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getVaniResponse(message: string, history: any[] = [], preferredLanguage: string = 'hi-IN') {
  const modelsToTry = [
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-pro-latest"
  ];

  let lastError: any = null;
  const isTelugu = preferredLanguage === 'te-IN';
  const langName = isTelugu ? "Telugu" : "Hindi";

  // Strict instructions
  const systemInstruction = `You are Vani, a helpful and charming Indian female AI assistant. 
  CRITICAL: You are in ${langName} mode. 
  - Respond ONLY in ${langName} script. 
  - Do NOT use English unless it is a proper noun like a name.
  - No mixing with other languages.
  - Maximum 1-2 sweet, warm sentences.
  - NEVER say you are busy or mention technical limits.`;

  // Ensure history alternates strictly
  let contents: any[] = [];
  if (history.length > 0) {
    let nextRole = 'user';
    for (const item of history) {
      if (item && item.role === nextRole) {
        contents.push(item);
        nextRole = nextRole === 'user' ? 'model' : 'user';
      }
    }
  }

  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts[0].text += `\n${message}`;
  } else {
    contents.push({ role: "user", parts: [{ text: message }] });
  }

  const finalContents = contents.slice(-8);

  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: finalContents,
        config: {
          systemInstruction: systemInstruction,
          maxOutputTokens: 250,
          temperature: 0.6, // Lower temperature for more consistency
        },
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (error: any) {
      lastError = error;
      if (error.status === 429) continue;
    }
  }

  throw lastError || new Error("System is momentarily busy. Please try in a moment.");
}

export async function saveLog(user: string, bot: string) {
  try {
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, bot, timestamp: new Date().toISOString() }),
    });
  } catch (e) {
    console.error("Logging error:", e);
  }
}
