"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AgentEvent,
  Citation,
  FriendlyError,
  Paper,
  ResearchPlan,
} from "@/lib/types";
import AgentTrace from "./AgentTrace";
import AnswerPanel from "./AnswerPanel";
import CitationList from "./CitationList";
import ErrorPanel from "./ErrorPanel";

const EXAMPLE_QUESTIONS = [
  "What are recent outcomes for temozolomide in glioblastoma multiforme?",
  "Is there evidence for anticoagulation in patients with atrial fibrillation over 80?",
  "How effective is CBT compared to SSRIs for treatment-resistant depression?",
  "What does the literature say about CRISPR therapy for sickle cell disease?",
];

interface TraceState {
  plan?: ResearchPlan;
  searches: Array<{ query: string; pmids: string[]; done: boolean }>;
  fetchCount: number;
  papers: Paper[];
  embedCount: number;
  embedDone: boolean;
  retrieveCount: number;
  retrieveDone: boolean;
  synthesisStarted: boolean;
  synthesisDone: boolean;
}

const EMPTY_TRACE: TraceState = {
  searches: [],
  fetchCount: 0,
  papers: [],
  embedCount: 0,
  embedDone: false,
  retrieveCount: 0,
  retrieveDone: false,
  synthesisStarted: false,
  synthesisDone: false,
};

export default function ChatInterface() {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceState>(EMPTY_TRACE);
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || isRunning) return;

      // Cancel anything in flight before starting a new one.
      abortRef.current?.abort();

      // Reset previous run state. This is what makes a second search "just work"
      // without a reload - the moment a new query is submitted, everything from
      // the previous run is cleared.
      setSubmittedQuestion(trimmed);
      setTrace(EMPTY_TRACE);
      setAnswer("");
      setCitations([]);
      setError(null);
      setIsRunning(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          // Treat HTTP-level failures the same way as agent-level errors.
          setError({
            title: "The server could not handle this request",
            message: `The API responded with status ${response.status}.`,
            tip: "Refresh the page and try again. If it keeps failing, check the dev server console for details.",
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep = buffer.indexOf("\n\n");
          while (sep !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            handleFrame(frame);
            sep = buffer.indexOf("\n\n");
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError({
          title: "Connection to the agent was interrupted",
          message:
            "The browser lost contact with the server in the middle of a request.",
          tip: "Check your internet connection and try again. If the dev server stopped, restart it with npm run dev.",
        });
      } finally {
        setIsRunning(false);
        abortRef.current = null;
      }
    },
    [isRunning],
  );

  const handleFrame = (frame: string) => {
    const line = frame.startsWith("data: ") ? frame.slice(6) : frame;
    if (!line.trim()) return;

    let event: AgentEvent;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    setTrace((prev) => {
      switch (event.type) {
        case "plan_done":
          return { ...prev, plan: event.plan };
        case "search_started":
          return {
            ...prev,
            searches: [
              ...prev.searches,
              { query: event.query, pmids: [], done: false },
            ],
          };
        case "search_done":
          return {
            ...prev,
            searches: prev.searches.map((s) =>
              s.query === event.query && !s.done
                ? { ...s, pmids: event.pmids, done: true }
                : s,
            ),
          };
        case "fetch_started":
          return { ...prev, fetchCount: event.count };
        case "fetch_done":
          return { ...prev, papers: event.papers };
        case "embed_started":
          return { ...prev, embedCount: event.count };
        case "embed_done":
          return { ...prev, embedDone: true };
        case "retrieve_started":
          return { ...prev };
        case "retrieve_done":
          return {
            ...prev,
            retrieveCount: event.count,
            retrieveDone: true,
          };
        case "synthesize_started":
          return { ...prev, synthesisStarted: true };
        case "synthesize_done":
          return { ...prev, synthesisDone: true };
        default:
          return prev;
      }
    });

    if (event.type === "synthesize_token") {
      setAnswer((a) => a + event.token);
    } else if (event.type === "synthesize_done") {
      setAnswer(event.answer);
      setCitations(event.citations);
    } else if (event.type === "error") {
      setError(event.friendly);
    }
  };

  const hasResults = submittedQuestion !== null;

  const triggerSubmit = () => {
    submit(question);
    setQuestion("");
  };

  return (
    <div className="space-y-12">
      <div className="space-y-6 animate-fade-up">
        <SearchBox
          value={question}
          onChange={setQuestion}
          onSubmit={triggerSubmit}
          disabled={isRunning}
          hasResults={hasResults}
        />

        {!hasResults && (
          <div className="space-y-2">
            <p className="font-sans text-xs uppercase tracking-widest text-ink-faint">
              Try one of these
            </p>
            <ul className="space-y-1.5">
              {EXAMPLE_QUESTIONS.map((q) => (
                <li key={q}>
                  <button
                    onClick={() => submit(q)}
                    disabled={isRunning}
                    className="group flex items-baseline gap-3 text-left text-ink-soft transition hover:text-accent disabled:opacity-50"
                  >
                    <span className="font-mono text-xs text-ink-faint group-hover:text-accent">
                      ›
                    </span>
                    <span className="font-serif italic">{q}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {hasResults && (
        <div className="space-y-12 animate-fade-up">
          <div className="border-b border-rule pb-6">
            <p className="font-sans text-xs uppercase tracking-widest text-ink-faint">
              Current question
            </p>
            <p className="mt-2 font-serif text-2xl italic leading-snug text-ink">
              {submittedQuestion}
            </p>
          </div>

          {!error && <AgentTrace trace={trace} isRunning={isRunning} />}

          {!error && (trace.synthesisStarted || answer) && (
            <AnswerPanel answer={answer} streaming={!trace.synthesisDone} />
          )}

          {!error && trace.synthesisDone && citations.length > 0 && (
            <CitationList citations={citations} />
          )}

          {error && <ErrorPanel error={error} />}
        </div>
      )}
    </div>
  );
}

function SearchBox(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  hasResults: boolean;
}) {
  return (
    <div className="relative">
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            props.onSubmit();
          }
        }}
        disabled={props.disabled}
        placeholder={
          props.hasResults
            ? "Ask another question..."
            : "Ask a clinical question..."
        }
        rows={2}
        className="w-full resize-none rounded-sm border border-rule bg-paper-warm/30 px-5 py-4 font-serif text-lg leading-relaxed text-ink placeholder:italic placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-0 disabled:opacity-50"
      />
      <button
        onClick={props.onSubmit}
        disabled={props.disabled || !props.value.trim()}
        className="absolute bottom-3 right-3 rounded-sm bg-ink px-4 py-2 font-sans text-xs font-medium uppercase tracking-widest text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        {props.disabled ? "Working..." : "Research"}
      </button>
    </div>
  );
}
