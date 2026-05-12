/**
 * Shared type definitions for the Medical Literature Research Agent.
 */

import type { FriendlyError } from "./errors";
export type { FriendlyError };

/**
 * A single paper retrieved from PubMed, with parsed metadata.
 */
export interface Paper {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  year: string;
  doi: string | null;
  url: string;
  meshTerms: string[];
  publicationTypes: string[];
}

/**
 * A chunk of paper text plus the embedding vector and source metadata.
 * Used by the in-memory vector store.
 */
export interface PaperChunk {
  id: string;
  pmid: string;
  text: string;
  embedding: number[];
  section: "title" | "abstract";
  paperTitle: string;
  paperUrl: string;
  paperYear: string;
  paperJournal: string;
}

/**
 * A retrieval result: chunk plus the similarity score.
 */
export interface RetrievalResult {
  chunk: PaperChunk;
  score: number;
}

/**
 * A citation reference in the final answer, numbered like an academic paper.
 */
export interface Citation {
  index: number;
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  url: string;
}

/**
 * The plan produced by the planner: a set of PubMed queries to run, plus a
 * brief justification of the decomposition.
 */
export interface ResearchPlan {
  reasoning: string;
  queries: string[];
}

/**
 * Events streamed to the frontend so the user can see what the agent is doing.
 */
export type AgentEvent =
  | { type: "plan_started" }
  | { type: "plan_done"; plan: ResearchPlan }
  | { type: "search_started"; query: string }
  | { type: "search_done"; query: string; pmids: string[] }
  | { type: "fetch_started"; count: number }
  | { type: "fetch_done"; papers: Paper[] }
  | { type: "embed_started"; count: number }
  | { type: "embed_done" }
  | { type: "retrieve_started" }
  | { type: "retrieve_done"; count: number }
  | { type: "synthesize_started" }
  | { type: "synthesize_token"; token: string }
  | { type: "synthesize_done"; answer: string; citations: Citation[] }
  | { type: "error"; friendly: FriendlyError };

/**
 * Encode an event as a Server-Sent Events line.
 */
export function encodeEvent(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
