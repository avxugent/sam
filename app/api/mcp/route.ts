/**
 * POST /api/mcp — read-only Model Context Protocol server (Streamable HTTP,
 * stateless: one server + transport per request, JSON responses, no sessions).
 *
 * Auth: `Authorization: Bearer <API key>` (Settings → Profile → API keys). The
 * route is exempt from the proxy's session redirect, so it authenticates
 * itself here. All tools only read; every role may use a key.
 */
import { NextRequest, NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "@/lib/mcp/tools";
import { apiKeyUser } from "@/lib/tokens/api-key";
import { consumeRateLimit } from "@/lib/rate-limit";
import { tooManyAttemptsResponse } from "@/lib/rate-limit/http";

const RATE_LIMIT_PER_MINUTE = 120;

export async function POST(req: NextRequest) {
  const result = await apiKeyUser(req);
  if ("error" in result) return result.error;

  const rl = consumeRateLimit(`mcp:${result.keyId}`, RATE_LIMIT_PER_MINUTE, 60 * 1000);
  if (!rl.allowed) return tooManyAttemptsResponse(rl.retryAfterMs);

  const server = new McpServer({ name: "sam", version: "1.0.0" });
  registerTools(server);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

/** Stateless server: there is no SSE stream to open and no session to end. */
function methodNotAllowed() {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: { Allow: "POST" } }
  );
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
