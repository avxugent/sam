"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import type { JiraIssue } from "@/lib/integrations/jira";

/** 404: JIRA does not know the key; any other failure: JIRA (or the request) is down. */
type Lookup = { status: "found"; issue: JiraIssue } | { status: "missing" } | { status: "unavailable" };

const CATEGORY_COLORS: Record<string, string> = {
  todo: "bg-muted text-secondary-foreground",
  "in-progress": "bg-warning-tint text-warning-foreground",
  done: "bg-success-surface text-success-foreground",
  unknown: "bg-muted text-secondary-foreground",
};

export function JiraIssueBadge({ issueKey, jiraBaseUrl }: { issueKey: string; jiraBaseUrl?: string | null }) {
  const t = useTranslations("workLog");
  const [lookup, setLookup] = useState<Lookup | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLookup(null);
    apiFetch<JiraIssue>(`/api/jira/issue/${encodeURIComponent(issueKey)}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setLookup({ status: "found", issue: res.data });
      else setLookup({ status: res.status === 404 ? "missing" : "unavailable" });
    });
    return () => { cancelled = true; };
  }, [issueKey]);

  const issue = lookup?.status === "found" ? lookup.issue : null;
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
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary-tint text-primary hover:bg-primary-tint-hover transition-colors max-w-[280px] group"
      title={issue?.summary ?? issueKey}
    >
      <span className="font-mono">{issueKey}</span>
      {lookup === null ? (
        <span className="text-subtle truncate">…</span>
      ) : issue ? (
        <>
          <span className="text-secondary-foreground truncate font-normal">{issue.summary}</span>
          <span
            className={`text-[10px] px-1.5 py-0 rounded-full font-semibold ${CATEGORY_COLORS[issue.statusCategory] ?? CATEGORY_COLORS.unknown}`}
          >
            {issue.status}
          </span>
        </>
      ) : (
        <span className="text-subtle truncate font-normal">
          {lookup.status === "missing" ? t("jiraIssueNotFound") : t("jiraUnavailable")}
        </span>
      )}
      <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />
    </a>
  );
}
