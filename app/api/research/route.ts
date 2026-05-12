/**
 * POST /api/research
 *
 * Body: { question: string }
 * Response: a Server-Sent Events stream of AgentEvent values.
 *
 * Why SSE and not just streaming text:
 *   - The frontend needs structured events (plan, search, fetch, citations)
 *     not just a chat blob. SSE is the simplest way to push typed events
 *     from a serverless function to the browser.
 *   - The browser EventSource API would work too, but it's GET-only and
 *     adds CORS complexity. A plain ReadableStream with the right
 *     Content-Type works the same and supports POST.
 */

import { NextRequest } from "next/server";
import { runResearchAgent } from "@/lib/agent/orchestrator";
import { classifyError } from "@/lib/errors";
import { encodeEvent } from "@/lib/types";

// Run on Node.js, not Edge. The fast-xml-parser dependency uses Node APIs
// that the Edge runtime doesn't ship.
export const runtime = "nodejs";

// Allow up to 5 minutes for long research queries. The default 10s timeout
// is way too short for an agent doing multiple LLM calls + PubMed fetches.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let question: string;

  try {
    const body = await request.json();
    if (typeof body?.question !== "string" || body.question.trim().length === 0) {
      return new Response("question is required", { status: 400 });
    }
    question = body.question.trim();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runResearchAgent(question)) {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeEvent({ type: "error", friendly: classifyError(error) }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
