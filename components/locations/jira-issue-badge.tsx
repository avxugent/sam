"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

type FetchedIssue = {
  found: boolean;
  key?: string;
  summary?: string;
  status?: string;
  statusCategory?: "todo" | "in-progress" | "done" | "unknown";
  url?: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  todo: "bg-muted text-secondary-foreground",
  "in-progress": "bg-[#fef3c7] text-[#92400e]",
  done: "bg-[#dcfce7] text-[#15803d]",
  unknown: "bg-muted text-secondary-foreground",
};

export function JiraIssueBadge({ issueKey, jiraBaseUrl }: { issueKey: string; jiraBaseUrl?: string | null }) {
  const [issue, setIssue] = useState<FetchedIssue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<FetchedIssue>(`/api/jira/issue/${encodeURIComponent(issueKey)}`).then((res) => {
      if (cancelled) return;
      setIssue(res.ok ? res.data : { found: false });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [issueKey]);

  // Fallback URL when JIRA isn't reachable but a base URL is configured
  const fallbackUrl =
    issue?.url ??
    (jiraBaseUrl ? `${jiraBaseUrl.replace(/\/$/, "")}/browse/${issueKey}` : null);

  return (
    <a
      href={fallbackUrl ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => { if (!fallbackUrl) e.preventDefault(); }}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary-tint text-primary hover:bg-[#d4e3f7] transition-colors max-w-[280px] group"
      title={issue?.summary ?? issueKey}
    >
      <span className="font-mono">{issueKey}</span>
      {loading ? (
        <span className="text-subtle truncate">…</span>
      ) : issue?.found ? (
        <>
          <span className="text-secondary-foreground truncate font-normal">{issue.summary}</span>
          {issue.statusCategory && (
            <span
              className={`text-[10px] px-1.5 py-0 rounded-full font-semibold ${CATEGORY_COLORS[issue.statusCategory] ?? CATEGORY_COLORS.unknown}`}
            >
              {issue.status}
            </span>
          )}
        </>
      ) : null}
      <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />
    </a>
  );
}
