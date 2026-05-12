import ChatInterface from "@/components/ChatInterface";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-32 pt-20 sm:pt-28">
      <header className="mb-16 text-center animate-fade-up">
        <p className="mb-3 font-sans text-xs uppercase tracking-[0.25em] text-ink-muted">
          A research agent for the biomedical literature
        </p>
        <h1 className="text-balance font-serif text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
          The Literature
          <br />
          <span className="italic text-accent">Reads Itself.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl font-serif text-lg leading-relaxed text-ink-soft">
          Ask a clinical question. The agent decomposes it, searches PubMed
          across multiple angles, ranks the most relevant passages, and
          writes back an answer with every claim cited to its source.
        </p>
        <div className="mx-auto mt-8 h-px w-24 bg-rule" />
      </header>

      <ChatInterface />

      <footer className="mt-24 border-t border-rule pt-6 font-sans text-xs uppercase tracking-widest text-ink-faint">
        <div className="flex justify-between">
          <span>Powered by PubMed E-utilities &middot; Anthropic Claude &middot; Voyage AI</span>
          <span>v0.1</span>
        </div>
      </footer>
    </main>
  );
}
