"use client";

interface AnswerPanelProps {
  answer: string;
  streaming: boolean;
}

/**
 * Renders the synthesizer's streaming answer with light markdown support
 * (headings, bold, italic, lists) and clickable citation markers.
 */
export default function AnswerPanel({ answer, streaming }: AnswerPanelProps) {
  const blocks = parseBlocks(answer);

  return (
    <section>
      <p className="mb-4 font-sans text-xs uppercase tracking-widest text-ink-faint">
        Synthesis
      </p>
      <article className="font-serif text-[1.05rem] leading-[1.75] text-ink">
        {blocks.map((block, i) => {
          const isLast = i === blocks.length - 1;
          const cursor = streaming && isLast ? "streaming-cursor" : "";
          return renderBlock(block, i, cursor);
        })}
        {blocks.length === 0 && streaming && (
          <p className="streaming-cursor text-ink-muted italic"> </p>
        )}
      </article>
    </section>
  );
}

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "li"; ordinal: string; text: string }
  | { kind: "p"; text: string };

function parseBlocks(text: string): Block[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const blocks: Block[] = [];
  let buffer: string[] = [];

  const flushParagraph = () => {
    if (buffer.length > 0) {
      blocks.push({ kind: "p", text: buffer.join(" ") });
      buffer = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith("### ")) {
      flushParagraph();
      blocks.push({ kind: "h3", text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
      continue;
    }
    const listMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      blocks.push({ kind: "li", ordinal: listMatch[1], text: listMatch[2] });
      continue;
    }
    buffer.push(line);
  }
  flushParagraph();
  return blocks;
}

function renderBlock(block: Block, key: number, cursorClass: string) {
  if (block.kind === "h2") {
    return (
      <h3
        key={key}
        className={`mt-7 mb-3 font-serif text-2xl font-semibold leading-tight text-ink ${cursorClass}`}
      >
        {renderInline(block.text)}
      </h3>
    );
  }
  if (block.kind === "h3") {
    return (
      <h4
        key={key}
        className={`mt-5 mb-2 font-sans text-sm font-semibold uppercase tracking-wider text-accent ${cursorClass}`}
      >
        {renderInline(block.text)}
      </h4>
    );
  }
  if (block.kind === "li") {
    return (
      <div key={key} className={`mb-3 flex gap-3 ${cursorClass}`}>
        <span className="font-mono text-sm font-semibold text-accent">
          {block.ordinal}.
        </span>
        <span>{renderInline(block.text)}</span>
      </div>
    );
  }
  return (
    <p key={key} className={`mb-5 ${cursorClass}`}>
      {renderInline(block.text)}
    </p>
  );
}

/**
 * Inline parser: handles **bold**, *italic*, and [N] citation markers.
 */
function renderInline(text: string): React.ReactNode[] {
  // First, split on citation markers so we can render them as links.
  const citeRegex = /\[(\d+)\]/g;
  const segments: Array<{ kind: "text" | "cite"; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "cite", value: match[1] });
    lastIndex = citeRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return segments.map((seg, i) => {
    if (seg.kind === "cite") {
      const n = seg.value;
      return (
          < a
          key={`c-${i}`}
          href={`#citation-${n}`}
          className="citation-marker"
          onClick={(e) => {
            const target = document.getElementById(`citation-${n}`);
            if (target) {
              e.preventDefault();
              target.scrollIntoView({ behavior: "smooth", block: "center" });
              target.classList.add("ring-2", "ring-accent");
              setTimeout(() => target.classList.remove("ring-2", "ring-accent"), 1500);
            }
          }}
        >
          [{n}]
        </a>
      );
    }
    return <span key={`t-${i}`}>{renderBoldItalic(seg.value)}</span>;
  });
}

/**
 * Render **bold** and *italic* within a plain text segment.
 */
function renderBoldItalic(text: string): React.ReactNode[] {
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(regex).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={i}>{part}</span>;
  });
}