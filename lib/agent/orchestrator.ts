/**
 * Orchestrator: the main agent loop.
 *
 * Flow (each step streams progress to the UI):
 *
 *   1. PLAN       -> decompose the user's question into 2-4 PubMed queries.
 *   2. SEARCH     -> run each query against PubMed, collect unique PMIDs.
 *   3. FETCH      -> pull title, abstract, authors, journal, year for each.
 *   4. CHUNK      -> split title + abstract into retrieval units.
 *   5. EMBED      -> get vectors for each chunk and the question.
 *   6. RETRIEVE   -> top-k chunks by cosine similarity to the question.
 *   7. SYNTHESIZE -> stream a final answer with numbered citations.
 *
 * The orchestrator returns an async generator of AgentEvent values, which
 * the API route serializes as Server-Sent Events to the frontend.
 *
 * This is the file a client looks at when they're evaluating whether you
 * actually understand agent design. Make it readable.
 */

import { searchPubMed, fetchPapers } from "../pubmed/client";
import { embed } from "../embeddings";
import { InMemoryVectorStore } from "../vector-store";
import { planQueries } from "./planner";
import { chunkPaper } from "./chunker";
import { synthesizeAnswer } from "./synthesizer";
import { classifyError } from "../errors";
import type { AgentEvent, Paper, PaperChunk } from "../types";

const MAX_PAPERS_PER_QUERY = 8;
const TOP_K = 8;
const MAX_CHUNKS_PER_PAPER = 2;

export async function* runResearchAgent(
  question: string,
): AsyncGenerator<AgentEvent, void, void> {
  try {
    // ----- 1. PLAN -----
    yield { type: "plan_started" };
    const plan = await planQueries(question);
    yield { type: "plan_done", plan };

    // If the planner returned no queries, the input was not a medical
    // question. Stop with a friendly explanation instead of trying to
    // search PubMed with nothing.
    if (plan.queries.length === 0) {
      yield {
        type: "error",
        friendly: {
          title: "This does not look like a medical question",
          message:
            "The agent only searches the biomedical literature on PubMed, so it needs a clinical or research-style question. " +
            (plan.reasoning ? `Here is what it understood: "${plan.reasoning}"` : ""),
          tip: "Try something like 'What is the recommended first-line treatment for type 2 diabetes?' or 'Recent meta-analyses on SSRIs in adolescents'.",
        },
      };
      return;
    }

    // ----- 2. SEARCH -----
    // Run all queries in parallel. Collect a deduplicated set of PMIDs so
    // we don't fetch or embed the same paper twice when queries overlap.
    const seenPmids = new Set<string>();
    const searchPromises = plan.queries.map(async (query) => {
      const pmids = await searchPubMed(query, MAX_PAPERS_PER_QUERY);
      return { query, pmids };
    });

    // We can't easily yield from inside Promise.all, so we await each
    // sequentially. For 2-4 queries this is fine and gives the UI clean
    // step-by-step progress.
    const allPmids: string[] = [];
    for (const promise of searchPromises) {
      const { query, pmids } = await promise;
      yield { type: "search_started", query };
      const newPmids = pmids.filter((p) => !seenPmids.has(p));
      newPmids.forEach((p) => seenPmids.add(p));
      allPmids.push(...newPmids);
      yield { type: "search_done", query, pmids: newPmids };
    }

    if (allPmids.length === 0) {
      yield {
        type: "synthesize_done",
        answer:
          "No papers were found in PubMed for any of the search queries derived from your question. Try rephrasing with more specific terms or check the spelling of any drug or condition names.",
        citations: [],
      };
      return;
    }

    // ----- 3. FETCH -----
    yield { type: "fetch_started", count: allPmids.length };
    const papers = await fetchPapers(allPmids);
    const papersWithAbstracts = papers.filter((p) => p.abstract.trim().length > 0);
    yield { type: "fetch_done", papers: papersWithAbstracts };

    if (papersWithAbstracts.length === 0) {
      yield {
        type: "synthesize_done",
        answer:
          "Papers were found, but none had abstracts available through PubMed. This sometimes happens for older or non-indexed records. Try a different phrasing.",
        citations: [],
      };
      return;
    }

    // ----- 4. CHUNK + 5. EMBED -----
    const chunkDrafts = papersWithAbstracts.flatMap(chunkPaper);

    yield { type: "embed_started", count: chunkDrafts.length };

    // Embed corpus chunks and the question in parallel.
    const [chunkVectors, [questionVector]] = await Promise.all([
      embed({
        texts: chunkDrafts.map((c) => c.text),
        inputType: "document",
      }),
      embed({ texts: [question], inputType: "query" }),
    ]);

    const chunks: PaperChunk[] = chunkDrafts.map((draft, i) => ({
      ...draft,
      embedding: chunkVectors[i],
    }));

    const store = new InMemoryVectorStore();
    store.upsert(chunks);
    yield { type: "embed_done" };

    // ----- 6. RETRIEVE -----
    yield { type: "retrieve_started" };
    const retrieved = store.searchDiverse(questionVector, TOP_K, MAX_CHUNKS_PER_PAPER);
    yield { type: "retrieve_done", count: retrieved.length };

    // ----- 7. SYNTHESIZE -----
    yield { type: "synthesize_started" };

    // Stream-friendly capture: token callback pushes into a queue, the
    // generator drains it between awaits.
    const tokenQueue: string[] = [];
    let finalAnswer = "";
    let finalCitations: ReturnType<typeof enrichCitations> = [];

    const synthesisPromise = synthesizeAnswer({
      question,
      retrievedChunks: retrieved,
      onToken: (token) => {
        tokenQueue.push(token);
      },
    }).then((result) => {
      finalAnswer = result.answer;
      finalCitations = enrichCitations(result.citations, papersWithAbstracts);
    });

    // Drain tokens as they arrive. Polling every 20ms is fast enough to
    // feel real-time to a human, slow enough not to spin the event loop.
    while (true) {
      while (tokenQueue.length > 0) {
        yield { type: "synthesize_token", token: tokenQueue.shift()! };
      }
      const done = await Promise.race([
        synthesisPromise.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 20)),
      ]);
      if (done) break;
    }

    // Flush any tokens that arrived after the last drain.
    while (tokenQueue.length > 0) {
      yield { type: "synthesize_token", token: tokenQueue.shift()! };
    }

    yield {
      type: "synthesize_done",
      answer: finalAnswer,
      citations: finalCitations,
    };
  } catch (error) {
    yield { type: "error", friendly: classifyError(error) };
  }
}

/**
 * The synthesizer builds Citation objects with empty authors (it only sees
 * chunks, not full Paper records). We fill in author lists here from the
 * fetched papers so the UI can render proper academic-style citations.
 */
function enrichCitations(
  citations: Array<{
    index: number;
    pmid: string;
    title: string;
    authors: string[];
    journal: string;
    year: string;
    url: string;
  }>,
  papers: Paper[],
) {
  const papersByPmid = new Map(papers.map((p) => [p.pmid, p]));
  return citations.map((c) => ({
    ...c,
    authors: papersByPmid.get(c.pmid)?.authors ?? c.authors,
  }));
}
