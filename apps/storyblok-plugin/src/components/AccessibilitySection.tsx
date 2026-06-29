import Image from "next/image";
import { type AuditCategory, type AuditResult } from "@/types";
import AuditResultItem from "@/components/AuditResultItem";

const CATEGORY_META: Record<
  AuditCategory,
  { label: string; iconSrc: string; passedText: string }
> = {
  a11y: {
    label: "Accessibility",
    iconSrc: "/accessibility-icon.svg",
    passedText: "No accessibility issues found.",
  },
  afm: {
    label: "AFM Readability",
    iconSrc: "/afm-icon.svg",
    passedText: "All readability checks passed.",
  },
  brand: {
    label: "Brand & Tone",
    iconSrc: "/brand-icon.svg",
    passedText: "No brand or tone issues found.",
  },
};

type CategorySectionProps = {
  category: AuditCategory;
  audits: AuditResult[];
};

const severityRank: Record<AuditResult["severity"], number> = {
  blocking: 3,
  warning: 2,
  info: 1,
};

function sortBySeverityHighToLow(audits: AuditResult[]) {
  return [...audits].sort((a, b) => {
    const rankDelta = severityRank[b.severity] - severityRank[a.severity];
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return a.audit.localeCompare(b.audit);
  });
}

export default function CategorySection({ category, audits }: CategorySectionProps) {
  const { label, iconSrc, passedText } = CATEGORY_META[category];
  const failing = sortBySeverityHighToLow(audits.filter((a) => !a.passed));
  const passing = sortBySeverityHighToLow(audits.filter((a) => a.passed));

  return (
    <section className="space-y-2" id={`section-${category}`}>
      <header className="flex items-center gap-2.5 rounded-xl border border-[var(--cg-border)] bg-[var(--cg-panel)] px-4 py-2.5">
        <Image src={iconSrc} alt="" width={20} height={20} className="opacity-80" />
        <h2 className="text-sm font-bold tracking-wide text-zinc-900">{label}</h2>
        <span className="ml-auto text-xs text-zinc-500">
          {failing.length === 0
            ? `${audits.length} checks passed`
            : `${failing.length} issue${failing.length > 1 ? "s" : ""}`}
        </span>
      </header>

      {audits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-5 text-sm text-zinc-500">
          {passedText}
        </p>
      ) : (
        <div className="space-y-2">
          {failing.map((r) => (
            <AuditResultItem key={r.audit} result={r} />
          ))}
          {passing.map((r) => (
            <AuditResultItem key={r.audit} result={r} />
          ))}
        </div>
      )}
    </section>
  );
}
