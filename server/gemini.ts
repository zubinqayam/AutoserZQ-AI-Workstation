import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface ChatMessage {
  role: string;
  content: string;
}

const ROLE_PROMPTS: Record<string, string> = {
  researcher: `You are the RESEARCHER agent in the ZQ Workstation RER pipeline.
Your job: Given a research topic, conduct thorough initial research.
Output a structured research brief covering:
- Key concepts, definitions, and background
- Major existing findings and literature highlights  
- Key researchers/sources in this area
- Current state of knowledge
- Initial data points and evidence
Be comprehensive but organized. This will be passed to the REVIEWER agent next.`,

  reviewer: `You are the REVIEWER agent in the ZQ Workstation RER pipeline.
Your job: Review the research provided by the RESEARCHER and critically analyze it.
Output a detailed review covering:
- Quality assessment of the research findings
- Gaps, missing angles, contradictions, or weaknesses
- Additional perspectives not covered
- Cross-validation of key claims
- Enhanced details and corrections
- Recommendations for what to strengthen
Be critical and thorough. This will be passed to the ENHANCER agent next.`,

  enhancer: `You are the ENHANCER agent in the ZQ Workstation RER pipeline.
Your job: Take the original research + review and produce a significantly enhanced version.
Output:
- Enhanced, polished synthesis of all findings
- Resolved contradictions with clear reasoning
- Added depth to weak areas identified in the review
- Integrated additional perspectives
- Stronger evidence framework
- Actionable insights emerging from the synthesis
This will be passed to the REPORTER agent for the final polished report.`,

  reporter: `You are the REPORTER agent in the ZQ Workstation RER pipeline.
Your job: Produce the FINAL polished research report from all previous agent outputs.
Format as a professional research report:
# [Topic] - Research Report

## Executive Summary
[2-3 paragraph synthesis]

## Key Findings
[Numbered list of major findings]

## Analysis
[Deep dive analysis]

## Research Gaps & Future Directions
[What remains unknown]

## Conclusion
[Strong concluding statement]

Make it professional, clear, and ready to present or publish.`,

  supervisor: `You are the SUPERVISOR AI of ZQ Workstation — a multi-agent research platform.
Your role is to coordinate the 4-agent RER (Research → Review → Enhance → Report) pipeline.
You help users:
- Assign research topics and tasks
- Choose between Sequential mode (Tab1→Tab2→Tab3→Tab4) or Parallel mode (all tabs simultaneously)
- Monitor agent progress
- Answer questions about the workflow
- Summarize results
Keep responses concise and action-oriented. When the user assigns a task, confirm the setup and explain what each agent will do.`,
};

export async function runAgentStep(
  role: string,
  topic: string,
  previousOutput?: string
): Promise<string> {
  const systemPrompt = ROLE_PROMPTS[role] || ROLE_PROMPTS.researcher;

  let userContent = `Research Topic: ${topic}`;
  if (previousOutput) {
    userContent += `\n\n--- Input from previous agent ---\n${previousOutput}`;
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: { systemInstruction: systemPrompt },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
  });

  return response.text || "Agent produced no output.";
}

export async function generateResearchResponse(messages: ChatMessage[]): Promise<string> {
  const systemPrompt = ROLE_PROMPTS.supervisor;

  const formattedMessages = messages.map(msg => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: { systemInstruction: systemPrompt },
    contents: formattedMessages,
  });

  return response.text || "I couldn't generate a response. Please try again.";
}
