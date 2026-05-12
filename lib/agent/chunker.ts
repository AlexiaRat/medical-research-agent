/**
 * Chunking strategy.
 *
 * Each paper produces 1 to 3 chunks depending on abstract length:
 *   - Always: a "title" chunk containing the paper's title (high-signal
 *     for keyword-style questions).
 *   - One or more "abstract" chunks. Short abstracts (<= 1200 chars)
 *     stay as a single chunk. Longer ones are split on paragraph
 *     boundaries (PubMed abstracts often have section headers like
 *     BACKGROUND, METHODS, RESULTS) with a small overlap.
 *
 * This is a deliberately simple scheme. For longer documents (full-text
 * papers, clinical guidelines, internal docs) you'd use a more sophisticated
 * approach like LangChain's RecursiveCharacterTextSplitter.
 */

import type { Paper, PaperChunk } from "../types";

const MAX_CHUNK_SIZE = 1200;
const OVERLAP_SIZE = 150;

export function chunkPaper(paper: Paper): Omit<PaperChunk, "embedding">[] {
  const chunks: Omit<PaperChunk, "embedding">[] = [];

  // Always emit the title as its own chunk. Titles are short and highly
  // discriminative for keyword retrieval.
  if (paper.title) {
    chunks.push({
      id: `${paper.pmid}-title`,
      pmid: paper.pmid,
      text: paper.title,
      section: "title",
      paperTitle: paper.title,
      paperUrl: paper.url,
      paperYear: paper.year,
      paperJournal: paper.journal,
    });
  }

  // Skip empty abstracts. Some PubMed records have only title + metadata.
  if (!paper.abstract.trim()) return chunks;

  const abstractChunks = splitAbstract(paper.abstract);
  abstractChunks.forEach((text, i) => {
    chunks.push({
      id: `${paper.pmid}-abstract-${i}`,
      pmid: paper.pmid,
      text,
      section: "abstract",
      paperTitle: paper.title,
      paperUrl: paper.url,
      paperYear: paper.year,
      paperJournal: paper.journal,
    });
  });

  return chunks;
}

function splitAbstract(text: string): string[] {
  if (text.length <= MAX_CHUNK_SIZE) return [text];

  // First try to split on PubMed section headers (BACKGROUND:, METHODS:, etc.)
  // since these are semantic boundaries.
  const sections = text.split(/\n\n+/).filter((s) => s.trim().length > 0);
  if (sections.length > 1) {
    return mergeSmallSections(sections);
  }

  // Fall back to fixed-size windows with overlap.
  return slidingWindow(text);
}

/**
 * Merge sections that are too small to be useful on their own, but keep
 * sections separate when they have substantive content.
 */
function mergeSmallSections(sections: string[]): string[] {
  const merged: string[] = [];
  let buffer = "";

  for (const section of sections) {
    if (buffer.length + section.length + 2 <= MAX_CHUNK_SIZE) {
      buffer = buffer ? `${buffer}\n\n${section}` : section;
    } else {
      if (buffer) merged.push(buffer);
      if (section.length > MAX_CHUNK_SIZE) {
        merged.push(...slidingWindow(section));
        buffer = "";
      } else {
        buffer = section;
      }
    }
  }

  if (buffer) merged.push(buffer);
  return merged;
}

function slidingWindow(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + MAX_CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - OVERLAP_SIZE;
  }
  return chunks;
}
