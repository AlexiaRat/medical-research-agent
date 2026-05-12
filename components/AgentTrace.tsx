"use client";

import type { Paper, ResearchPlan } from "@/lib/types";

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

export default function AgentTrace({
  trace,
  isRunning,
}: {
  trace: TraceState;
  isRunning: boolean;
}) {
  const steps = buildSteps(trace, isRunning);

  return (
    <section>
      <p className="mb-4 font-sans text-xs uppercase tracking-widest text-ink-faint">
        Agent trace
      </p>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li
            key={i}
            className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-l-2 border-rule pl-4 transition"
            style={{
              borderColor: step.state === "active" ? "var(--accent)" : undefined,
            }}
          >
            <StepIndicator state={step.state} />
            <div className="font-sans text-sm text-ink-soft">
              <div className="font-medium text-ink">
                {step.label}
              </div>
              {step.detail && (
                <div className="mt-1 font-serif text-[0.95rem] italic text-ink-muted">
                  {step.detail}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

type StepState = "pending" | "active" | "done";

interface Step {
  label: string;
  detail: React.ReactNode;
  state: StepState;
}

function buildSteps(trace: TraceState, isRunning: boolean): Step[] {
  const steps: Step[] = [];

  // PLAN
  if (trace.plan) {
    steps.push({
      label: "Decomposed question into search queries",
      detail: (
        <div>
          <div className="text-ink-soft not-italic">{trace.plan.reasoning}</div>
          <ul className="mt-2 space-y-1">
            {trace.plan.queries.map((q) => (
              <li key={q} className="font-mono text-xs not-italic text-accent">
                {q}
              </li>
            ))}
          </ul>
        </div>
      ),
      state: "done",
    });
  } else if (isRunning) {
    steps.push({
      label: "Planning queries",
      detail: null,
      state: "active",
    });
  }

  // SEARCHES
  trace.searches.forEach((s) => {
    steps.push({
      label: s.done
        ? `Searched PubMed: ${s.pmids.length} unique result${s.pmids.length === 1 ? "" : "s"}`
        : "Searching PubMed",
      detail: (
        <span className="font-mono text-xs not-italic">{s.query}</span>
      ),
      state: s.done ? "done" : "active",
    });
  });

  // FETCH
  if (trace.papers.length > 0) {
    steps.push({
      label: `Fetched ${trace.papers.length} paper${trace.papers.length === 1 ? "" : "s"} with abstracts`,
      detail: (
        <span>
          {trace.papers.slice(0, 3).map((p) => p.title).join(" · ")}
          {trace.papers.length > 3 ? " · ..." : ""}
        </span>
      ),
      state: "done",
    });
  } else if (trace.fetchCount > 0 && trace.papers.length === 0) {
    steps.push({
      label: `Fetching ${trace.fetchCount} paper${trace.fetchCount === 1 ? "" : "s"}`,
      detail: null,
      state: "active",
    });
  }

  // EMBED
  if (trace.embedDone) {
    steps.push({
      label: `Embedded ${trace.embedCount} chunk${trace.embedCount === 1 ? "" : "s"} into the vector store`,
      detail: null,
      state: "done",
    });
  } else if (trace.embedCount > 0) {
    steps.push({
      label: `Embedding ${trace.embedCount} chunk${trace.embedCount === 1 ? "" : "s"}`,
      detail: null,
      state: "active",
    });
  }

  // RETRIEVE
  if (trace.retrieveDone) {
    steps.push({
      label: `Retrieved top ${trace.retrieveCount} most relevant passages`,
      detail: null,
      state: "done",
    });
  } else if (trace.embedDone) {
    steps.push({
      label: "Retrieving relevant passages",
      detail: null,
      state: "active",
    });
  }

  // SYNTHESIZE
  if (trace.synthesisStarted) {
    steps.push({
      label: trace.synthesisDone
        ? "Synthesized answer with citations"
        : "Writing answer",
      detail: null,
      state: trace.synthesisDone ? "done" : "active",
    });
  }

  return steps;
}

function StepIndicator({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <div className="mt-1 flex h-4 w-4 items-center justify-center">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 7L6 10L11 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
          />
        </svg>
      </div>
    );
  }
  if (state === "active") {
    return (
      <div className="mt-1.5 h-2 w-2 animate-soft-pulse rounded-full bg-accent" />
    );
  }
  return <div className="mt-1.5 h-2 w-2 rounded-full bg-rule" />;
}
