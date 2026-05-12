"use client";

import type { Citation } from "@/lib/types";

/**
 * Numbered citations rendered like a published-paper reference list.
 * Each entry is targetable by id="citation-N" so the inline markers in the
 * answer can scroll-to-and-highlight them.
 */
export default function CitationList({
  citations,
}: {
  citations: Citation[];
}) {
  return (
    <section>
      <p className="mb-4 font-sans text-xs uppercase tracking-widest text-ink-faint">
        References
      </p>
      <ol className="space-y-4">
        {citations.map((c) => (
          <li
            key={c.index}
            id={`citation-${c.index}`}
            className="grid grid-cols-[auto_1fr] gap-4 rounded-sm p-3 transition"
          >
            <span className="font-sans text-sm font-semibold tabular-nums text-accent">
              [{c.index}]
            </span>
            <div className="space-y-1 font-serif text-[0.95rem] leading-snug text-ink-soft">
              <div className="text-ink">{c.title}</div>
              <div className="text-ink-muted">
                <span>{formatAuthors(c.authors)}</span>
                <span className="mx-2 text-ink-faint">·</span>
                <span className="italic">{c.journal || "Journal"}</span>
                {c.year && (
                  <>
                    <span className="mx-2 text-ink-faint">·</span>
                    <span>{c.year}</span>
                  </>
                )}
              </div>
              <div>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-xs uppercase tracking-widest text-ink-faint underline-offset-4 transition hover:text-accent hover:underline"
                >
                  PubMed PMID {c.pmid}
                </a>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Format authors as "Smith J, Jones K, Garcia M" or trim to "Smith J, et al."
 * for papers with many authors.
 */
function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return "Unknown authors";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")}, et al.`;
}
