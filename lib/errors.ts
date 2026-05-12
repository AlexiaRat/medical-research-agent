/**
 * Error classification.
 *
 * Converts raw, technical errors from any layer (LLM API, embeddings,
 * PubMed, parsing) into structured user-facing messages with:
 *   - A short, human-readable title (`title`)
 *   - A clear description of what went wrong (`message`)
 *   - An actionable tip the user can follow (`tip`)
 *
 * This is the single source of truth for "what does this error look like
 * to the user". The UI does not need to parse error strings; it just
 * displays the structured fields.
 */

export interface FriendlyError {
  title: string;
  message: string;
  tip: string;
}

/**
 * Take any caught error and produce a friendly version.
 *
 * The classification is pattern-based on the error message (since errors
 * come from many different libraries with different shapes). For each
 * pattern we have a hand-written friendly explanation.
 */
export function classifyError(error: unknown): FriendlyError {
  const raw = errorToString(error).toLowerCase();

  // ---- Anthropic / Claude API ----
  if (raw.includes("invalid x-api-key") || raw.includes("authentication_error")) {
    return {
      title: "The Anthropic API key is not valid",
      message:
        "The agent could not connect to Claude because the configured Anthropic API key was rejected.",
      tip: "Open your .env.local file, paste a fresh key from https://console.anthropic.com, save it, and restart the server. Make sure there are no quotes or extra spaces around the key.",
    };
  }

  if (raw.includes("anthropic_api_key is not set")) {
    return {
      title: "No Anthropic API key configured",
      message:
        "The agent needs an Anthropic API key to plan and answer questions, but none was found in the environment.",
      tip: "Create a key at https://console.anthropic.com, add it to .env.local as ANTHROPIC_API_KEY=..., then restart the server.",
    };
  }

  if (raw.includes("rate_limit") && raw.includes("anthropic")) {
    return {
      title: "Too many requests to Claude",
      message:
        "Anthropic's API is currently rate-limiting your account.",
      tip: "Wait about a minute and try again. If this keeps happening, check your plan limits in the Anthropic console.",
    };
  }

  if (raw.includes("insufficient_quota") || raw.includes("billing")) {
    return {
      title: "Anthropic credit ran out",
      message:
        "Your Anthropic account does not have enough credit to run this query.",
      tip: "Top up at https://console.anthropic.com under Settings → Billing.",
    };
  }

  // ---- Voyage AI (embeddings) ----
  if (raw.includes("voyage") && raw.includes("api key is invalid")) {
    return {
      title: "The Voyage API key is not valid",
      message:
        "Embeddings could not be generated because the Voyage AI key was rejected.",
      tip: "Get a fresh key from https://www.voyageai.com (free tier), put it in .env.local as VOYAGE_API_KEY=..., and restart the server.",
    };
  }

  if (raw.includes("voyage_api_key is not set")) {
    return {
      title: "No Voyage API key configured",
      message:
        "The agent needs a Voyage AI key to embed the retrieved papers, but none was found.",
      tip: "Sign up for free at https://www.voyageai.com, create a key, add it to .env.local as VOYAGE_API_KEY=..., then restart the server.",
    };
  }

  if (raw.includes("voyage") && raw.includes("rate")) {
    return {
      title: "Voyage embeddings rate-limited",
      message:
        "Voyage AI is throttling your account because of too many requests in a short time.",
      tip: "Wait a few seconds and try again. The free tier has 50M tokens per month, which is generous, but per-minute limits still apply.",
    };
  }

  // ---- PubMed / NCBI ----
  if (raw.includes("pubmed responded 429") || raw.includes("too many requests")) {
    return {
      title: "PubMed is throttling requests",
      message:
        "The National Library of Medicine rate-limited the agent. This is usually a brief, transient issue.",
      tip: "Wait 5–10 seconds and try again. For a permanent fix, add a free NCBI API key to .env.local as NCBI_API_KEY=... — it raises the limit from 3 to 10 requests per second. Get one at https://www.ncbi.nlm.nih.gov/account/settings/",
    };
  }

  if (raw.includes("pubmed esearch failed") || raw.includes("pubmed efetch failed")) {
    return {
      title: "PubMed is unreachable",
      message:
        "The agent could not connect to PubMed. The service may be temporarily down or there could be a network issue.",
      tip: "Wait a moment and retry. If it keeps failing, check https://status.ncbi.nlm.nih.gov/ for outages.",
    };
  }

  // ---- Validation / non-medical input ----
  if (
    raw.includes("array must contain at least") ||
    raw.includes("generatestructured failed") ||
    raw.includes("queries")
  ) {
    return {
      title: "This does not look like a medical question",
      message:
        "The agent only searches the biomedical literature on PubMed, so it needs a clinical or research-style question to work with.",
      tip: "Try something like 'What is the recommended treatment for type 2 diabetes?' or 'Recent outcomes of CAR-T therapy in pediatric ALL?'",
    };
  }

  // ---- Network / fetch failures ----
  if (
    raw.includes("fetch failed") ||
    raw.includes("network") ||
    raw.includes("etimedout") ||
    raw.includes("econnrefused")
  ) {
    return {
      title: "Network issue",
      message:
        "The agent could not reach one of its external services. Your internet connection or one of the APIs may be down.",
      tip: "Check your connection and try again. If only this app fails but other sites load, an upstream API is probably temporarily down.",
    };
  }

  // ---- Timeouts ----
  if (raw.includes("timeout") || raw.includes("aborted")) {
    return {
      title: "The request took too long",
      message:
        "One of the steps in the agent pipeline exceeded its time budget.",
      tip: "Try again. If it keeps happening on the same question, simplify it — very broad questions can retrieve dozens of papers and slow things down.",
    };
  }

  // ---- Catch-all ----
  return {
    title: "Something unexpected happened",
    message:
      "The agent ran into an error it could not classify. This is usually a transient problem.",
    tip: "Wait a moment and try again. If it keeps happening with the same question, try rephrasing it.",
  };
}

function errorToString(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
