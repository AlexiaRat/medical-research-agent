/**
 * Synthesizer agent.
 *
 * Input:
 *   - The user's original question.
 *   - The top-k retrieved chunks (with paper metadata).
 *
 * Output:
 *   - A streaming, structured answer that cites sources by their numbered
 *     index, like an academic paper: "Temozolomide extends median survival
 *     by 2-3 months [1][2]."
 *   - A citation list mapping each [N] back to a PubMed paper.
 *
 * Why streaming:
 *   - Synthesis takes 5-15s depending on length. Streaming tokens to the UI
 *     makes the wait feel instant and shows the user the agent is working.
 *
 * Why numbered citations:
 *   - Matches how researchers and clinicians actually read papers.
 *   - Easy to verify: click [3] -> see exactly which paper that came from.
 *   - Avoids the "Claude said X, but where did it come from?" problem.
 */

import { getAnthropicClient, SYNTHESIS_MODEL } from "../llm";
import type { Citation, RetrievalResult } from "../types";

interface SynthesizeArgs {
  question: string;
  retrievedChunks: RetrievalResult[];
  onToken: (token: string) => void;
}

interface SynthesizeResult {
  answer: string;
  citations: Citation[];
}

const SYSTEM_PROMPT = `You are a medical research assistant helping a clinician or researcher understand the published literature on their question.

You will be given:
1. The user's question.
2. A numbered list of source passages, each from a published paper.

Rules:
- Answer in clear, structured prose. Use short paragraphs. No marketing language. No "I hope this helps".
- Every factual claim must be supported by a citation in the form [N] where N is the source number. Place citations immediately after the claim, before the period.
- You can cite multiple sources for one claim: [1][3] is valid.
- If the sources do not contain enough information to answer fully, say so. Do not invent numbers, dosages, or outcomes.
- If sources disagree, surface the disagreement explicitly.
- Use medical terminology accurately. Do not dumb things down for a clinician audience.
- Keep the answer focused. 200 to 500 words is usually right. If the question is narrow, keep it shorter.
- Do not include a "References" or "Citations" section at the end. The UI renders that separately.`;

export async function synthesizeAnswer(
  args: SynthesizeArgs,
): Promise<SynthesizeResult> {
  const { question, retrievedChunks, onToken } = args;

  if (retrievedChunks.length === 0) {
    const fallback =
      "No relevant papers were found in PubMed for this question. Try rephrasing with more specific medical terms or check whether the topic is well-indexed in the biomedical literature.";
    onToken(fallback);
    return { answer: fallback, citations: [] };
  }

  const { sourcesBlock, citations } = buildSources(retrievedChunks);

  const userPrompt = `Question:
${question}

Sources:
${sourcesBlock}

Write your answer now. Use [N] citations inline.`;

  const client = getAnthropicClient();

  const stream = client.messages.stream({
    model: SYNTHESIS_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  let answer = "";
  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      const token = chunk.delta.text;
      answer += token;
      onToken(token);
    }
  }

  return { answer, citations };
}

/**
 * Convert retrieval results into a numbered sources block for the prompt,
 * plus a Citations array for the UI. We dedupe by PMID so the same paper
 * appears only once in the citation list, even if multiple chunks from it
 * were retrieved.
 */
function buildSources(retrievedChunks: RetrievalResult[]): {
  sourcesBlock: string;
  citations: Citation[];
} {
  const seenPmids = new Map<string, number>();
  const citations: Citation[] = [];
  const sourceLines: string[] = [];

  for (const result of retrievedChunks) {
    const { chunk } = result;
    let index = seenPmids.get(chunk.pmid);

    if (index === undefined) {
      index = citations.length + 1;
      seenPmids.set(chunk.pmid, index);
      citations.push({
        index,
        pmid: chunk.pmid,
        title: chunk.paperTitle,
        authors: [], // Filled in by orchestrator from Paper objects.
        journal: chunk.paperJournal,
        year: chunk.paperYear,
        url: chunk.paperUrl,
      });
    }

    sourceLines.push(
      `[${index}] (${chunk.paperJournal}, ${chunk.paperYear}) ${chunk.paperTitle}\n${chunk.text}`,
    );
  }

  return {
    sourcesBlock: sourceLines.join("\n\n---\n\n"),
    citations,
  };
}
