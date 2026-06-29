import { Check, CheckCircle2, CircleAlert, Copy } from "lucide-react";
import { useState } from "react";
import { type AuditResult } from "@/types";
import { Badge } from "@/components/ui/Badge";

type AuditResultItemProps = {
  result: AuditResult;
};

export default function AuditResultItem({ result }: AuditResultItemProps) {
  const [copied, setCopied] = useState(false);
  const statusLabel = result.passed ? "Passed" : "Failed";
  const statusVariant = result.passed ? "success" : "destructive";
  const StatusIcon = result.passed ? CheckCircle2 : CircleAlert;
  const promptText = createFixPrompt(result);

  const copyPrompt = async () => {
    if (!promptText) {
      return;
    }

    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className="rounded-xl border border-[var(--cg-border)] bg-white/80 p-4 shadow-sm backdrop-blur-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-wide text-zinc-900">{result.audit}</h3>
          <p className="text-sm text-zinc-700">{result.message}</p>
        </div>
        <Badge variant={statusVariant} className="gap-1.5">
          <StatusIcon className="h-3.5 w-3.5" />
          {statusLabel}
        </Badge>
      </header>

      {!result.passed && promptText && (
        <section className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
              Suggested Prompt For Storyblok
            </h4>
            <button
              type="button"
              onClick={copyPrompt}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-md bg-white p-2 text-xs text-zinc-700">
            {promptText}
          </pre>
        </section>
      )}
    </article>
  );
}

function createFixPrompt(result: AuditResult): string | null {
  if (result.passed) {
    return null;
  }

  if (result.audit === "accessibility-heading-order") {
    const expectedOrder = String(result.meta?.expectedOrder ?? "H1 -> H2 -> H3");
    const foundOrder = String(result.meta?.foundOrder ?? "Unknown");
    const selector = String(result.meta?.selector ?? "Unknown selector");

    return [
      "Fix this Storyblok content accessibility issue:",
      `- Audit: ${result.audit}`,
      `- Problem: ${result.message}`,
      `- Expected heading order: ${expectedOrder}`,
      `- Found heading order: ${foundOrder}`,
      `- Affected block/selector: ${selector}`,
      "",
      "Please rewrite the content structure so heading levels increase one level at a time,",
      "without skipping levels, while keeping the same meaning.",
      "Return only the corrected heading hierarchy and updated text.",
    ].join("\n");
  }

  return [
    "Fix this Storyblok accessibility issue:",
    `- Audit: ${result.audit}`,
    `- Problem: ${result.message}`,
    "",
    "Please propose exact content changes (headings/text) that resolve this issue",
    "while preserving the original meaning.",
  ].join("\n");
}
