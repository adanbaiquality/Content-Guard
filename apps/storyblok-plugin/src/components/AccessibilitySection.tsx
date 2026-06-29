import { type AuditCategory, type AuditResult } from "@/types";
import AuditResultItem from "@/components/AuditResultItem";

const CATEGORY_META: Record<AuditCategory, { passedText: string }> = {
  a11y: {
    passedText: "No accessibility issues found.",
  },
  afm: {
    passedText: "All readability checks passed.",
  },
  brand: {
    passedText: "No brand or tone issues found.",
  },
};

type CategorySectionProps = {
  category: AuditCategory;
  audits: AuditResult[];
  settingsUrl?: string;
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

export default function CategorySection({ category, audits, settingsUrl }: CategorySectionProps) {
  const { passedText } = CATEGORY_META[category];
  const failing = sortBySeverityHighToLow(audits.filter((a) => !a.passed));
  const passing = sortBySeverityHighToLow(audits.filter((a) => a.passed));

  return (
    <section className="space-y-2" id={`section-${category}`}>
      {settingsUrl ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <a
            href={settingsUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline decoration-blue-400 underline-offset-2 hover:decoration-blue-700"
          >
            Open Brand Settings in Storyblok
          </a>
        </div>
      ) : null}

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
