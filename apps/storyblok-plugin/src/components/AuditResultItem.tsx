import { Check, CheckCircle2, CircleAlert, Copy, OctagonAlert, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { type AuditResult } from "@/types";

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

function getRuleUrl(result: AuditResult): string | null {
  if (result.ruleUrl) {
    return result.ruleUrl;
  }

  if (result.ruleId?.startsWith("WCAG")) {
    return getWcagRuleUrl(result.ruleId);
  }

  return null;
}

export default function AuditResultItem({ result }: AuditResultItemProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [context, setContext] = useState("");
  const ruleUrl = getRuleUrl(result);

  if (result.passed) {
    return (
      <div className="flex items-center justify-between gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-800">{result.message}</span>
        </div>
        {result.ruleId && ruleUrl && (
          <a
            href={ruleUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700 underline-offset-2 hover:text-emerald-900 hover:underline"
            title="Open this official reference"
          >
            {result.ruleId}
          </a>
        )}
        {result.ruleId && !ruleUrl && (
          <span className="shrink-0 rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            {result.ruleId}
          </span>
        )}
      </div>
    );
  }

  const severityMeta = {
    critical: {
      icon: OctagonAlert,
      label: "Critical",
      variant: "destructive" as const,
    },
    serious: {
      icon: TriangleAlert,
      label: "Serious",
      variant: "warning" as const,
    },
    moderate: {
      icon: TriangleAlert,
      label: "Moderate",
      variant: "warning" as const,
    },
    minor: {
      icon: CircleAlert,
      label: "Minor",
      variant: "default" as const,
    },
  }[result.severity];

  const severityVariant = severityMeta.variant;
  const SeverityIcon = severityMeta.icon;
  const severityLabel = severityMeta.label;
  const promptText = buildPrompt(result, context);

  const copyWithFallback = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to execCommand fallback.
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();

      const copiedWithCommand = document.execCommand("copy");
      document.body.removeChild(textarea);
      return copiedWithCommand;
    } catch {
      return false;
    }
  };

  const copyPrompt = async () => {
    setCopyFailed(false);

    const didCopy = await copyWithFallback(promptText);
    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      return;
    }

    setCopied(false);
    setCopyFailed(true);
  };

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--cg-border)] bg-white shadow-sm">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--cg-border)] bg-zinc-50/70 px-4 py-2.5">
        <Badge variant={severityVariant} className="gap-1">
          <SeverityIcon className="h-3 w-3" />
          {severityLabel}
        </Badge>
        {result.ruleId && ruleUrl && (
          <a
            href={ruleUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 underline-offset-2 hover:text-zinc-800 hover:underline"
            title="Open this official reference"
          >
            {result.ruleId}
          </a>
        )}
        {result.ruleId && !ruleUrl && (
          <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600">
            {result.ruleId}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="space-y-3 px-4 py-3">
        <p className="text-sm text-zinc-700">{result.message}</p>

        {/* NOW / SUGGESTION comparison */}
        {result.current && result.suggestion && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
              <p className="mb-1 text-[10px] font-bold tracking-wider text-red-600 uppercase">
                Now
              </p>
              <p className="text-xs text-red-800">{result.current}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
              <p className="mb-1 text-[10px] font-bold tracking-wider text-emerald-600 uppercase">
                Suggestion
              </p>
              <p className="text-xs text-emerald-800">{result.suggestion}</p>
            </div>
          </div>
        )}

        {/* Context textarea */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-500">
            Add context for the AI fix <span className="font-normal text-zinc-400">(optional)</span>
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
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied!" : "Copy fix-prompt"}
          </button>
        </div>
        {copyFailed && (
          <p className="text-[11px] text-amber-700">
            Copy is blocked in this iframe. Select text manually and press Cmd+C.
          </p>
        )}
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
    result.ruleUrl ? `- Rule source: ${result.ruleUrl}` : "",
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
