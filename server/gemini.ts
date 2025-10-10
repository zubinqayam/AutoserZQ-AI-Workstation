import { GoogleGenAI } from "@google/genai";

// Integration from blueprint:javascript_gemini
// Using Gemini 2.5 Flash for cost-effective research assistance
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface ChatMessage {
  role: string;
  content: string;
}

export async function generateResearchResponse(messages: ChatMessage[]): Promise<string> {
  try {
    const systemPrompt = `You are an AI research assistant for AutoserGPT AI Workstation. 
Your role is to help users with:
- Literature review and gap analysis
- Research synthesis and summarization
- Academic paper recommendations
- Technical explanations and clarifications

Provide clear, concise, and academically rigorous responses. 
When discussing research, cite key concepts and methodologies where relevant.`;

    const formattedMessages = messages.map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemPrompt,
      },
      contents: formattedMessages,
    });

    return response.text || "I apologize, but I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error(`AI assistance unavailable: ${error}`);
  }
}

export async function analyzeResearchQuery(query: string): Promise<string> {
  try {
    const prompt = `Analyze this research query and provide:
1. Key research themes and concepts
2. Potential research gaps to explore
3. Suggested literature review approach

Query: ${query}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "Unable to analyze query";
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error(`Query analysis failed: ${error}`);
  }
}
