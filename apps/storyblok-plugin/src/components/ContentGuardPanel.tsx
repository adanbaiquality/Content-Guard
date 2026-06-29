import Image from "next/image";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import CategorySection from "@/components/AccessibilitySection";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { mockAuditResults, mockCategorySettingsLinks } from "@/mocks/auditResults";
import { type AuditCategory, type AuditResult } from "@/types";

const CATEGORIES: AuditCategory[] = ["a11y", "afm", "brand"];

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  a11y: "Accessibility",
  afm: "AFM",
  brand: "Brand",
};

const CATEGORY_ICONS: Record<AuditCategory, string> = {
  a11y: "/accessibility-icon.svg",
  afm: "/afm-icon.svg",
  brand: "/brand-icon.svg",
};

function getCategoryStatus(audits: AuditResult[]) {
  const failing = audits.filter((a) => !a.passed);
  if (failing.length === 0) return "pass";
  if (failing.some((a) => a.severity === "blocking")) return "blocking";
  return "warning";
}

function isAuditCategory(value: string): value is AuditCategory {
  return CATEGORIES.includes(value as AuditCategory);
}

function toExportRow(category: AuditCategory, result: AuditResult) {
  return {
    Category: CATEGORY_LABELS[category],
    Audit: result.audit,
    Status: result.passed ? "Passed" : "Failed",
    Passed: result.passed,
    Severity: result.severity,
    Message: result.message,
    "Rule ID": result.ruleId ?? "",
    Current: result.current ?? "",
    Suggestion: result.suggestion ?? "",
  };
}

function downloadResultsAsXlsx(byCategory: Record<AuditCategory, AuditResult[]>) {
  const workbook = XLSX.utils.book_new();

  const allRows = CATEGORIES.flatMap((category) =>
    byCategory[category].map((result) => toExportRow(category, result)),
  );

  const allResultsSheet = XLSX.utils.json_to_sheet(allRows);
  XLSX.utils.book_append_sheet(workbook, allResultsSheet, "All Results");

  CATEGORIES.forEach((category) => {
    const rows = byCategory[category].map((result) => toExportRow(category, result));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, CATEGORY_LABELS[category]);
  });

  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  XLSX.writeFile(workbook, `content-guard-results-${timestamp}.xlsx`, {
    compression: true,
  });
}

function CategoryTabTrigger({
  category,
  audits,
}: {
  category: AuditCategory;
  audits: AuditResult[];
}) {
  const issueCount = audits.filter((a) => !a.passed).length;
  const status = getCategoryStatus(audits);

  const styles = {
    pass: "border-emerald-200 text-emerald-700 data-[state=active]:bg-emerald-50",
    blocking: "border-red-200 text-red-700 data-[state=active]:bg-red-50",
    warning: "border-amber-200 text-amber-700 data-[state=active]:bg-amber-50",
  };

  const dotStyles = {
    pass: "bg-emerald-500",
    blocking: "bg-red-500",
    warning: "bg-amber-500",
  };

  return (
    <TabsTrigger
      value={category}
      className={cn(
        "inline-flex h-auto items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition data-[state=active]:shadow-sm",
        "bg-white/50 hover:bg-white data-[state=active]:text-current",
        styles[status],
      )}
    >
      <Image src={CATEGORY_ICONS[category]} alt="" width={14} height={14} className="opacity-75" />
      <span className="font-bold">{CATEGORY_LABELS[category]}</span>
      <span className="text-zinc-500">{issueCount} issue{issueCount === 1 ? "" : "s"}</span>
      <span className={`h-2 w-2 rounded-full ${dotStyles[status]}`} />
    </TabsTrigger>
  );
}

function ProgressSummary({ audits }: { audits: AuditResult[] }) {
  const total = audits.length;
  const remaining = audits.filter((a) => !a.passed).length;
  const done = total - remaining;
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--cg-border)] bg-white/80 px-3 py-2">
      <div
        className="relative grid h-12 w-12 place-items-center rounded-full"
        style={{
          background: `conic-gradient(#10b981 ${percent * 3.6}deg, #e5e7eb ${percent * 3.6}deg)`,
        }}
      >
        <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-[10px] font-bold text-zinc-700">
          {percent}%
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900">
          {done}/{total}
        </p>
      </div>
    </div>
  );
}

export default function ContentGuardPanel() {
  const [activeCategory, setActiveCategory] = useState<AuditCategory>("a11y");

  const byCategory = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map((cat) => [cat, mockAuditResults.filter((r) => r.category === cat)]),
      ) as Record<AuditCategory, AuditResult[]>,
    [],
  );

  const activeAudits = byCategory[activeCategory];

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5 rounded-2xl border border-[var(--cg-border)] bg-white/80 p-5 shadow-lg shadow-zinc-200/40 backdrop-blur-sm sm:p-6">
      {/* Header */}
      <header className="flex items-center gap-3 rounded-xl border border-[var(--cg-border)] bg-[linear-gradient(130deg,#ebf8ef_0%,#faf8ec_100%)] px-4 py-3.5">
        <div className="rounded-lg border border-emerald-200 bg-white p-1.5">
          <Image src="/guard-icon.svg" alt="Content Guard" width={28} height={28} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-extrabold tracking-tight text-zinc-900">Content Guard</h1>
          <p className="text-xs text-zinc-600">Content quality checks for Storyblok entries</p>
        </div>
        <ProgressSummary audits={activeAudits} />
      </header>

      <Tabs
        value={activeCategory}
        onValueChange={(value) => {
          if (isAuditCategory(value)) {
            setActiveCategory(value);
          }
        }}
      >
        {/* Category tabs + export */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            {CATEGORIES.map((cat) => (
              <CategoryTabTrigger key={cat} category={cat} audits={byCategory[cat]} />
            ))}
          </TabsList>

          <button
            type="button"
            onClick={() => downloadResultsAsXlsx(byCategory)}
            className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            Download XLSX
          </button>
        </div>
      </Tabs>

      {/* Active category section */}
      <div className="space-y-5">
        <CategorySection
          category={activeCategory}
          audits={activeAudits}
          settingsUrl={activeCategory === "brand" ? mockCategorySettingsLinks.brand : undefined}
        />
      </div>
    </section>
  );
}
