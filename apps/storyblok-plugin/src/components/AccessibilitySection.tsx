import { Accessibility } from "lucide-react";
import { type AuditResult } from "@/types";
import AuditResultItem from "@/components/AuditResultItem";

type AccessibilitySectionProps = {
  audits: AuditResult[];
};

export default function AccessibilitySection({ audits }: AccessibilitySectionProps) {
  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2 rounded-xl border border-[var(--cg-border)] bg-[var(--cg-panel)] px-4 py-3">
        <Accessibility className="h-5 w-5 text-emerald-700" />
        <h2 className="text-base font-bold tracking-wide text-zinc-900">Accessibility</h2>
      </header>
      {audits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm text-zinc-600">
          No accessibility audits found.
        </p>
      ) : (
        <div className="space-y-3">
          {audits.map((auditResult) => (
            <AuditResultItem key={auditResult.audit} result={auditResult} />
          ))}
        </div>
      )}
    </section>
  );
}
