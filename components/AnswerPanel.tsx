"use client";

/**
 * Renders the synthesizer's streaming answer.
 *
 * The answer text contains citation markers like [1] or [2][3]. We parse
 * those on the fly and render them as clickable superscript numbers that
 * scroll to the matching citation card below. This is the same convention
 * Nature and the NEJM use.
 *
 * Streaming behavior: while tokens are still arriving, a blinking cursor
 * is appended to the last paragraph so the user sees the response is live.
 */

interface AnswerPanelProps {
  answer: string;
  streaming: boolean;
}

export default function AnswerPanel({ answer, streaming }: AnswerPanelProps) {
  const paragraphs = answer
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <section>
      <p className="mb-4 font-sans text-xs uppercase tracking-widest text-ink-faint">
        Synthesis
      </p>
      <article className="font-serif text-[1.05rem] leading-[1.75] text-ink">
        {paragraphs.map((paragraph, i) => {
          const isLast = i === paragraphs.length - 1;
          return (
            <p
              key={i}
              className={`mb-5 ${streaming && isLast ? "streaming-cursor" : ""}`}
            >
              {renderWithCitations(paragraph)}
            </p>
          );
        })}
        {paragraphs.length === 0 && streaming && (
          <p className="streaming-cursor text-ink-muted italic"> </p>
        )}
      </article>
    </section>
  );
}

/**
 * Find citation markers in the form [N] or [N][M] and replace them with
 * <sup> elements that jump to the citation list. Everything else passes
 * through unchanged.
 */
function renderWithCitations(text: string): React.ReactNode[] {
  const regex = /\[(\d+)\]/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const n = match[1];
    nodes.push(
      <a
        key={`cite-${key++}`}
        href={`#citation-${n}`}
        className="citation-marker"
        onClick={(e) => {
          const target = document.getElementById(`citation-${n}`);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.classList.add("ring-2", "ring-accent");
            setTimeout(() => {
              target.classList.remove("ring-2", "ring-accent");
            }, 1500);
          }
        }}
      >
        [{n}]
      </a>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
