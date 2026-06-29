import AuditResultItem from "@/components/AuditResultItem";
import { type AuditCategory, type AuditResult } from "@/types";

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

function getWcagTuple(ruleId?: string): [number, number, number] | null {
  if (!ruleId) {
    return null;
  }

  const match = ruleId.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareWcagTuple(a: [number, number, number], b: [number, number, number]) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

function sortAudits(audits: AuditResult[]) {
  return [...audits].sort((a, b) => {
    const aWcag = getWcagTuple(a.ruleId);
    const bWcag = getWcagTuple(b.ruleId);

    if (aWcag && bWcag) {
      const wcagDelta = compareWcagTuple(aWcag, bWcag);
      if (wcagDelta !== 0) {
        return wcagDelta;
      }
    } else if (aWcag && !bWcag) {
      return -1;
    } else if (!aWcag && bWcag) {
      return 1;
    }

    const rankDelta = severityRank[b.severity] - severityRank[a.severity];
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return a.audit.localeCompare(b.audit);
  });
}

export default function CategorySection({ category, audits, settingsUrl }: CategorySectionProps) {
  const { passedText } = CATEGORY_META[category];
  const failing = sortAudits(audits.filter((a) => !a.passed));
  const passing = sortAudits(audits.filter((a) => a.passed));

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
