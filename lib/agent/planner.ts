/**
 * Planner agent.
 *
 * Input:  a user question in natural language.
 * Output: 0 to 4 focused PubMed search queries. When the input is not a
 *         clinical or biomedical question, returns 0 queries plus a
 *         reasoning string explaining why.
 *
 * Returning an empty array (instead of throwing) lets the orchestrator
 * show a clean "not a medical question" message to the user instead of
 * a raw validation error.
 */

import { z } from "zod";
import { generateStructured, PLANNER_MODEL } from "../llm";
import type { ResearchPlan } from "../types";

const PlanSchema = z.object({
  reasoning: z
    .string()
    .describe("A short explanation of how the question was broken down, or why no queries were generated."),
  queries: z
    .array(z.string())
    .max(4)
    .describe("Two to four PubMed search queries. Empty array if the input is not a medical question."),
});

const SYSTEM_PROMPT = `You are a medical research librarian assisting a clinician or researcher.

Your job is to take a clinical or research question and decompose it into focused PubMed search queries. PubMed search works best with concise keyword phrases, not full sentences. Use:
- Specific drug or intervention names
- Specific conditions
- Methodology terms (randomized controlled trial, meta-analysis, cohort study)
- MeSH terms when you know them

Avoid:
- Filler words like "what" or "how"
- Quoted phrases (PubMed handles AND/OR automatically)
- Date filters (we want everything PubMed has)

Return 2 to 4 queries that cover different angles of the question. If the question is narrow, return 1 to 2 queries.

If the input is NOT a clinical, medical, or biomedical research question (random characters, gibberish, off-topic, non-medical), return an EMPTY queries array and use the reasoning field to explain that the input is not a valid medical research question.`;

export async function planQueries(question: string): Promise<ResearchPlan> {
  const prompt = `Question from the user:

"${question}"

Decompose this into PubMed search queries, or return an empty array if it is not a medical question.`;

  const result = await generateStructured({
    model: PLANNER_MODEL,
    schema: PlanSchema,
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 600,
  });

  return result;
}
