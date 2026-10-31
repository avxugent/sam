import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isJiraConfigured, isValidJiraKey, fetchJiraIssue } from "@/lib/integrations/jira";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isJiraConfigured()) {
    return NextResponse.json({ error: "JIRA integration is not configured" }, { status: 503 });
  }

  const { key } = await params;
  if (!isValidJiraKey(key)) {
    return NextResponse.json({ error: "Invalid JIRA key format" }, { status: 400 });
  }

  const lookup = await fetchJiraIssue(key);
  if (lookup.status === "unavailable") {
    return NextResponse.json({ error: "JIRA could not be reached.", code: "jiraUnavailable" }, { status: 502 });
  }
  if (lookup.status === "missing") {
    return NextResponse.json({ found: false, key });
  }
  return NextResponse.json({ found: true, ...lookup.issue });
}
