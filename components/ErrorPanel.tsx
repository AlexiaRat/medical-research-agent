"use client";

import type { FriendlyError } from "@/lib/types";

/**
 * A human-readable error display.
 *
 * Replaces the raw stack-trace-in-a-red-box UI with three structured fields:
 *   - Title: what category of problem this is
 *   - Message: what specifically happened, in plain language
 *   - Tip: what the user can do about it
 *
 * The tip often contains a URL. We auto-link http/https URLs in the tip
 * so the user can click through directly.
 */
export default function ErrorPanel({ error }: { error: FriendlyError }) {
  return (
    <section className="rounded-sm border border-accent/30 bg-accent/[0.03] p-6">
      <p className="font-sans text-xs uppercase tracking-widest text-accent">
        Something went wrong
      </p>
      <h3 className="mt-2 font-serif text-xl leading-snug text-ink">
        {error.title}
      </h3>
      <p className="mt-3 font-serif text-[1.02rem] leading-relaxed text-ink-soft">
        {error.message}
      </p>
      <div className="mt-5 border-t border-rule pt-4">
        <p className="font-sans text-xs uppercase tracking-widest text-ink-faint">
          What to do
        </p>
        <p className="mt-2 font-serif text-[1rem] leading-relaxed text-ink-soft">
          {linkify(error.tip)}
        </p>
      </div>
    </section>
  );
}

function linkify(text: string): React.ReactNode[] {
  const regex = /(https?:\/\/[^\s,)]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <a
        key={`link-${key++}`}
        href={match[1]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
      >
        {match[1]}
      </a>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
