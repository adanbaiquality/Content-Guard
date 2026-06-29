import { ShieldCheck } from "lucide-react";
import AccessibilitySection from "@/components/AccessibilitySection";
import { mockAuditResults } from "@/mocks/auditResults";

function isAccessibilityAudit(auditName: string) {
  const normalized = auditName.toLowerCase();
  return normalized.includes("a11y") || normalized.includes("accessibility") || normalized.includes("heading");
}

export default function ContentGuardPanel() {
  const accessibilityAudits = mockAuditResults.filter((result) => isAccessibilityAudit(result.audit));

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 rounded-2xl border border-[var(--cg-border)] bg-white/80 p-5 shadow-lg shadow-zinc-200/40 backdrop-blur-sm sm:p-6">
      <header className="flex items-center gap-3 rounded-xl border border-[var(--cg-border)] bg-[linear-gradient(130deg,#ebf8ef_0%,#faf8ec_100%)] px-4 py-4">
        <div className="rounded-lg border border-emerald-300 bg-emerald-100 p-2 text-emerald-800">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 sm:text-2xl">Content Guard</h1>
          <p className="text-sm text-zinc-700">Content quality checks for Storyblok entries</p>
        </div>
      </header>

      <AccessibilitySection audits={accessibilityAudits} />
    </section>
  );
}
