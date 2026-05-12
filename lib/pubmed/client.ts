/**
 * PubMed E-utilities client.
 *
 * NCBI provides E-utilities as the canonical API for PubMed search and fetch.
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25501/
 *
 * Two endpoints used here:
 *   - esearch.fcgi: takes a query, returns a list of PubMed IDs (PMIDs).
 *   - efetch.fcgi: takes PMIDs, returns full paper records (XML).
 *
 * Rate limits:
 *   - Without API key: 3 requests/second.
 *   - With API key:    10 requests/second.
 *
 * We enforce those limits client-side with a module-level rate limiter,
 * and retry transient 429s with exponential backoff.
 */

import { XMLParser } from "fast-xml-parser";
import type { Paper } from "../types";

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL_NAME = "medical-research-agent";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
});

interface PubMedConfig {
  apiKey?: string;
  email?: string;
}

function getConfig(): PubMedConfig {
  return {
    apiKey: process.env.NCBI_API_KEY || undefined,
    email: process.env.NCBI_TOOL_EMAIL || undefined,
  };
}

function buildParams(extra: Record<string, string>): URLSearchParams {
  const config = getConfig();
  const params = new URLSearchParams({
    tool: TOOL_NAME,
    ...extra,
  });
  if (config.apiKey) params.set("api_key", config.apiKey);
  if (config.email) params.set("email", config.email);
  return params;
}

// ============================================================
// Rate limiter + retry
// ============================================================

/**
 * Module-level mutex that serializes PubMed requests across the entire
 * agent run. Without this, two parallel searches plus an eFetch can fire
 * within the same second and trigger a 429 from NCBI.
 *
 * Why a chained promise instead of a sleeping loop:
 *   - It guarantees strict ordering. Each new request waits for the
 *     previous one to release the slot.
 *   - It works across both parallel and sequential call sites without
 *     extra coordination.
 *
 * The minimum interval is chosen with a small safety margin over NCBI's
 * stated limits (3 req/sec without a key, 10 req/sec with one).
 */
let lastRequestAt = 0;
let chain: Promise<void> = Promise.resolve();

function getMinInterval(): number {
  return process.env.NCBI_API_KEY ? 110 : 360;
}

function acquireSlot(): Promise<void> {
  const next = chain.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    const minInterval = getMinInterval();
    if (elapsed < minInterval) {
      await sleep(minInterval - elapsed);
    }
    lastRequestAt = Date.now();
  });
  chain = next.catch(() => {}); // ensure chain doesn't break on a single failure
  return next;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with rate limiting and retry-with-backoff on 429 (Too Many Requests)
 * or 5xx errors. Bubbles up other errors immediately.
 */
async function pubmedFetch(
  url: string,
  init: RequestInit,
  maxAttempts = 4,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Backoff: 500ms, 1500ms, 3500ms. NCBI usually clears throttling
      // within 1-2 seconds.
      const backoffMs = 500 * (2 ** attempt - 1);
      await sleep(backoffMs);
    }

    await acquireSlot();

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(
        `PubMed responded ${response.status} (attempt ${attempt + 1}/${maxAttempts}).`,
      );
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `PubMed request failed: ${response.status} ${response.statusText}`,
      );
    }

    return response;
  }

  const hasKey = !!process.env.NCBI_API_KEY;
  const hint = hasKey
    ? "Try reducing query parallelism or wait a moment and retry."
    : "Setting NCBI_API_KEY in .env.local (free, takes 1 minute at https://www.ncbi.nlm.nih.gov/account/settings/) raises your limit from 3 to 10 requests/second.";

  throw new Error(
    `${lastError?.message ?? "PubMed request failed after retries."} ${hint}`,
  );
}

// ============================================================
// Public API
// ============================================================

/**
 * Search PubMed for papers matching a query. Returns up to `maxResults` PMIDs,
 * sorted by relevance (PubMed's default).
 */
export async function searchPubMed(
  query: string,
  maxResults: number = 10,
): Promise<string[]> {
  const params = buildParams({
    db: "pubmed",
    term: query,
    retmax: maxResults.toString(),
    retmode: "json",
    sort: "relevance",
  });

  const url = `${BASE_URL}/esearch.fcgi?${params.toString()}`;
  const response = await pubmedFetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const data = (await response.json()) as {
    esearchresult?: { idlist?: string[] };
  };

  return data.esearchresult?.idlist ?? [];
}

/**
 * Fetch full records for a list of PMIDs. Returns parsed Paper objects with
 * title, abstract, authors, journal, year, DOI and MeSH terms.
 */
export async function fetchPapers(pmids: string[]): Promise<Paper[]> {
  if (pmids.length === 0) return [];

  const params = buildParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
  });

  const url = `${BASE_URL}/efetch.fcgi?${params.toString()}`;
  const response = await pubmedFetch(url, {
    headers: { Accept: "application/xml" },
    cache: "no-store",
  });

  const xml = await response.text();
  return parsePubMedXml(xml);
}

// ============================================================
// XML parsing
// ============================================================

function parsePubMedXml(xml: string): Paper[] {
  const parsed = xmlParser.parse(xml);
  const articleSet = parsed?.PubmedArticleSet;
  if (!articleSet) return [];

  const rawArticles = articleSet.PubmedArticle;
  if (!rawArticles) return [];

  const articles = Array.isArray(rawArticles) ? rawArticles : [rawArticles];

  return articles.map(parseArticle).filter((p): p is Paper => p !== null);
}

function parseArticle(raw: any): Paper | null {
  try {
    const medlineCitation = raw?.MedlineCitation;
    const articleData = medlineCitation?.Article;
    if (!articleData) return null;

    const pmid = String(medlineCitation?.PMID?.["#text"] ?? medlineCitation?.PMID ?? "");
    if (!pmid) return null;

    const title = extractText(articleData.ArticleTitle);

    const abstractNode = articleData.Abstract?.AbstractText;
    const abstract = parseAbstract(abstractNode);

    const authorList = articleData.AuthorList?.Author;
    const authors = parseAuthors(authorList);

    const journal =
      extractText(articleData.Journal?.Title) ||
      extractText(articleData.Journal?.ISOAbbreviation) ||
      "";

    const year = parsePubYear(articleData.Journal?.JournalIssue?.PubDate);
    const doi = extractDoi(raw?.PubmedData?.ArticleIdList?.ArticleId);
    const meshTerms = parseMeshTerms(medlineCitation?.MeshHeadingList?.MeshHeading);

    const publicationTypes = parsePublicationTypes(
      articleData.PublicationTypeList?.PublicationType,
    );

    return {
      pmid,
      title,
      abstract,
      authors,
      journal,
      year,
      doi,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      meshTerms,
      publicationTypes,
    };
  } catch (error) {
    console.error("Failed to parse PubMed article:", error);
    return null;
  }
}

function extractText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && node !== null && "#text" in node) {
    return String((node as { "#text": unknown })["#text"] ?? "");
  }
  return "";
}

function parseAbstract(node: unknown): string {
  if (!node) return "";

  if (typeof node === "string") return node;

  if (Array.isArray(node)) {
    return node
      .map((section: any) => {
        const label = section?.["@_Label"] ? `${section["@_Label"]}: ` : "";
        const text = extractText(section);
        return `${label}${text}`.trim();
      })
      .filter((s) => s.length > 0)
      .join("\n\n");
  }

  if (typeof node === "object" && node !== null) {
    const obj = node as any;
    const label = obj["@_Label"] ? `${obj["@_Label"]}: ` : "";
    return `${label}${extractText(obj)}`.trim();
  }

  return "";
}

function parseAuthors(node: unknown): string[] {
  if (!node) return [];
  const authors = Array.isArray(node) ? node : [node];
  return authors
    .map((author: any) => {
      const last = extractText(author?.LastName);
      const fore = extractText(author?.ForeName) || extractText(author?.Initials);
      return [fore, last].filter(Boolean).join(" ").trim();
    })
    .filter((name) => name.length > 0);
}

function parsePubYear(pubDate: any): string {
  if (!pubDate) return "";
  const year = extractText(pubDate.Year);
  if (year) return year;
  const medlineDate = extractText(pubDate.MedlineDate);
  if (medlineDate) {
    const match = medlineDate.match(/\d{4}/);
    if (match) return match[0];
  }
  return "";
}

function extractDoi(articleIds: unknown): string | null {
  if (!articleIds) return null;
  const ids = Array.isArray(articleIds) ? articleIds : [articleIds];
  for (const id of ids) {
    if (id?.["@_IdType"] === "doi") {
      return extractText(id) || null;
    }
  }
  return null;
}

function parseMeshTerms(node: unknown): string[] {
  if (!node) return [];
  const headings = Array.isArray(node) ? node : [node];
  return headings
    .map((heading: any) => extractText(heading?.DescriptorName))
    .filter((term) => term.length > 0);
}

function parsePublicationTypes(node: unknown): string[] {
  if (!node) return [];
  const types = Array.isArray(node) ? node : [node];
  return types.map((t: any) => extractText(t)).filter((s) => s.length > 0);
}
