/**
 * Anthropic LLM client wrapper.
 *
 * Centralizes:
 *   - Model selection (one place to change defaults).
 *   - Structured output via Zod schemas (planner uses this).
 *   - Streaming for the synthesis step.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Models used across the agent:
 *
 *   PLANNER_MODEL    -> fast model for query decomposition.
 *   SYNTHESIS_MODEL  -> stronger model for the final answer with citations.
 *   EMBEDDING_DIM    -> dimensionality of our lightweight embeddings.
 *
 * Note on embeddings: Anthropic does not currently offer a first-party
 * embeddings API. For the demo we use a simple deterministic embedding
 * function in lib/embeddings.ts (good enough for ~20-50 papers). For
 * production scale, swap that file for Voyage AI or OpenAI embeddings.
 */
export const PLANNER_MODEL = "claude-haiku-4-5-20251001";
export const SYNTHESIS_MODEL = "claude-sonnet-4-6";

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env.local file.",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/**
 * Ask Claude to produce a structured JSON object validated against a Zod
 * schema. If parsing or validation fails, we retry once with the error
 * message attached so the model can self-correct.
 *
 * This pattern works well for tasks like planning, classification, or
 * routing where the output needs to be machine-readable.
 */
export async function generateStructured<T>(args: {
  model: string;
  schema: z.ZodSchema<T>;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  const { model, schema, system, prompt, maxTokens = 1024 } = args;
  const client = getAnthropicClient();

  const instruction = `\n\nReturn your answer as a single JSON object that matches this exact structure. Do not include any text before or after the JSON, and do not wrap it in markdown fences.`;

  const fullPrompt = `${prompt}${instruction}`;

  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptPrompt = lastError
      ? `${fullPrompt}\n\nYour previous response could not be parsed. Error: ${lastError}\nPlease return only valid JSON.`
      : fullPrompt;

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: attemptPrompt }],
    });

    const text = extractText(response);
    const parsed = tryParseJson(text);

    if (parsed === null) {
      lastError = "Response was not valid JSON.";
      continue;
    }

    const validation = schema.safeParse(parsed);
    if (validation.success) {
      return validation.data;
    }

    lastError = validation.error.message;
  }

  throw new Error(
    `generateStructured failed after retries. Last error: ${lastError}`,
  );
}

function extractText(response: Anthropic.Message): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

/**
 * Pull a JSON object out of a Claude response. We try direct parsing first,
 * then fall back to extracting the largest balanced { ... } substring in
 * case the model added a stray sentence around it despite instructions.
 */
function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();

  // Try direct parse first.
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through.
  }

  // Find the outermost { ... } block.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  return null;
}
