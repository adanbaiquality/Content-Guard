import { Check, CheckCircle2, Copy, OctagonAlert, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { type AuditResult } from "@/types";
import { Badge } from "@/components/ui/Badge";

const STORYBLOK_MCP_URL = "https://www.storyblok.com/mp/storyblok-mcp-server";
const WCAG22_QUICKREF_URL = "https://www.w3.org/WAI/WCAG22/quickref/";

const WCAG22_RULE_ANCHORS: Record<string, string> = {
  "1.3.1": "info-and-relationships",
  "2.4.4": "link-purpose-in-context",
};

type AuditResultItemProps = {
  result: AuditResult;
};

function getWcagRuleUrl(ruleId: string): string {
  const wcagNumber = ruleId.match(/(\d+\.\d+\.\d+)/)?.[1];
  if (!wcagNumber) {
    return WCAG22_QUICKREF_URL;
  }

  const anchor = WCAG22_RULE_ANCHORS[wcagNumber];
  return anchor ? `${WCAG22_QUICKREF_URL}#${anchor}` : WCAG22_QUICKREF_URL;
}

export default function AuditResultItem({ result }: AuditResultItemProps) {
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [context, setContext] = useState("");

  if (result.passed) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span className="text-xs font-medium text-emerald-800">{result.message}</span>
      </div>
    );
  }

  if (dismissed) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 opacity-60">
        <span className="text-xs text-zinc-500 line-through">{result.message}</span>
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="text-xs text-zinc-400 underline hover:text-zinc-600"
        >
          Undo
        </button>
      </div>
    );
  }

  const severityVariant = result.severity === "blocking" ? "destructive" : "warning";
  const SeverityIcon = result.severity === "blocking" ? OctagonAlert : TriangleAlert;
  const severityLabel = result.severity === "blocking" ? "Blocking" : "Warning";

  const promptText = buildPrompt(result, context);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--cg-border)] bg-white shadow-sm">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--cg-border)] bg-zinc-50/70 px-4 py-2.5">
        <Badge variant={severityVariant} className="gap-1">
          <SeverityIcon className="h-3 w-3" />
          {severityLabel}
        </Badge>
        {result.ruleId && (
          <a
            href={getWcagRuleUrl(result.ruleId)}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 underline-offset-2 hover:text-zinc-800 hover:underline"
            title="Open this WCAG 2.2 success criterion"
          >
            {result.ruleId}
          </a>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm text-zinc-700">{result.message}</p>

        {/* NOW / SUGGESTION comparison */}
        {result.current && result.suggestion && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-red-600">Now</p>
              <p className="text-xs text-red-800">{result.current}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                Suggestion
              </p>
              <p className="text-xs text-emerald-800">{result.suggestion}</p>
            </div>
          </div>
        )}

        {/* Context textarea */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-500">
            Add context for the AI fix{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            placeholder="e.g. this is the main CTA on a mortgage page, formal tone"
            className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 placeholder-zinc-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyPrompt}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 active:scale-95"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy fix-prompt"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 shadow-sm hover:bg-zinc-50 active:scale-95"
          >
            <X className="h-3.5 w-3.5" />
            {result.severity === "blocking" ? "Dismiss" : "Mark as seen"}
          </button>
        </div>
      </div>
    </article>
  );
}

function buildPrompt(result: AuditResult, userContext: string): string {
  const lines: string[] = [
    `Fix this Storyblok content ${result.category} issue:`,
    `- Category: ${result.category.toUpperCase()}`,
    `- Severity: ${result.severity}`,
    result.ruleId ? `- Rule: ${result.ruleId}` : "",
    `- Problem: ${result.message}`,
    result.current ? `- Current content: ${result.current}` : "",
    result.suggestion ? `- Suggested replacement: ${result.suggestion}` : "",
    userContext ? `\nAdditional context from editor:\n${userContext}` : "",
    "",
    "Please propose exact, minimal content changes that resolve this issue while preserving the original meaning.",
    "",
    `Tip: Use the Storyblok MCP server (${STORYBLOK_MCP_URL}) to apply changes directly to your story via AI.`,
  ];

  return lines.filter((l) => l !== "").join("\n");
}
