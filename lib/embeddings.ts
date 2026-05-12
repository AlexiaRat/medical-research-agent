/**
 * Voyage AI embeddings client.
 *
 * Why Voyage and not OpenAI:
 *   - Anthropic's officially recommended embedding partner for Claude apps.
 *   - voyage-3 has strong retrieval quality, often beating text-embedding-3.
 *   - Free tier: 50M tokens/month, plenty for this demo.
 *
 * Docs: https://docs.voyageai.com/reference/embeddings-api
 */

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";
const MAX_BATCH_SIZE = 128;

interface VoyageResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

/**
 * Embed a batch of strings into vectors using Voyage AI.
 *
 * `inputType` matters for retrieval quality. "document" is used when
 * indexing your corpus; "query" is used at search time. Voyage tunes the
 * model differently for each.
 */
export async function embed(args: {
  texts: string[];
  inputType: "document" | "query";
}): Promise<number[][]> {
  const { texts, inputType } = args;
  if (texts.length === 0) return [];

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VOYAGE_API_KEY is not set. Add it to your .env.local file. " +
        "Get a free key at https://www.voyageai.com.",
    );
  }

  // Voyage caps each call at 128 inputs. Batch if needed.
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    batches.push(texts.slice(i, i + MAX_BATCH_SIZE));
  }

  const allEmbeddings: number[][] = [];
  for (const batch of batches) {
    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: batch,
        model: VOYAGE_MODEL,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Voyage embeddings failed (${response.status}): ${text.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as VoyageResponse;

    // Voyage returns vectors in the order of the inputs (via `index` field).
    // Sort defensively in case the API reorders.
    const sorted = data.data.slice().sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}
