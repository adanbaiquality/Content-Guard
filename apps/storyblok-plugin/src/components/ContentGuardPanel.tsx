import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import CategorySection from "@/components/AccessibilitySection";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { mockCategorySettingsLinks } from "@/mocks/auditResults";
import { type AuditCategory, type AuditResult } from "@/types";
import { getApiBaseUrl } from "@/utils/api";
import { APP_BRIDGE_ORIGIN, KEY_SLUG } from "@/utils/const";

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

type WorkflowRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

type WorkflowAudit = {
  audit: string;
  message: string;
  meta?: Record<string, unknown>;
  passed: boolean;
  step?: string;
};

type WorkflowStepSummary = {
  audits: WorkflowAudit[];
  failed: number;
  name: string;
  passed: number;
  total: number;
};

type WorkflowOutput = {
  audits: WorkflowAudit[];
  status: "completed";
  summary: {
    checks?: WorkflowStepSummary[];
    failed: number;
    passed: number;
    steps?: WorkflowStepSummary[];
    total: number;
  };
};

type WorkflowRunOutputResponse = {
  ok: true;
  output: WorkflowOutput | undefined;
  runId: string;
  status: WorkflowRunStatus;
  workflowName: string;
};

type StoryContext = {
  spaceId?: string;
  storyId?: string;
};

const LAST_WORKFLOW_RUN_ID_KEY = "content_guard:last_workflow_run_id";
const WORKFLOW_TRIGGER_LOCK_KEY = "content_guard:workflow_trigger_lock";
const HTTP_STATUS_OK = 200;
const OUTPUT_POLL_DELAY_MS = 1200;
const OUTPUT_POLL_MAX_ATTEMPTS = 25;

function getWcagRuleFromTags(tags: string[]): string | undefined {
  const wcagTag = tags.find((tag) => /^wcag\d{3}$/.test(tag));
  if (!wcagTag) {
    return undefined;
  }

  const digits = wcagTag.slice("wcag".length);
  return `WCAG ${digits[0]}.${digits[1]}.${digits[2]}`;
}

function mapImpactToSeverity(impact: unknown): AuditResult["severity"] {
  if (impact === "critical" || impact === "serious") {
    return "blocking";
  }

  if (impact === "moderate" || impact === "minor") {
    return "warning";
  }

  return "info";
}

function mapA11yAudit(step: WorkflowStepSummary): AuditResult[] {
  const sourceAudit = step.audits[0];
  const violations = Array.isArray(sourceAudit?.meta?.violations)
    ? (sourceAudit.meta.violations as Array<Record<string, unknown>>)
    : [];

  if (violations.length === 0) {
    return [
      {
        audit: "preview-a11y-axe-passed",
        category: "a11y",
        message: sourceAudit?.message || "No accessibility issues found.",
        passed: true,
        severity: "info",
      },
    ];
  }

  return violations.map((violation, index) => {
    const tags = Array.isArray(violation.tags)
      ? violation.tags.filter((tag): tag is string => typeof tag === "string")
      : [];

    return {
      audit: `preview-a11y-axe-${String(violation.id || index)}`,
      category: "a11y",
      current: typeof violation.description === "string" ? violation.description : undefined,
      message:
        typeof violation.help === "string"
          ? violation.help
          : sourceAudit?.message || "Accessibility issue found.",
      meta: {
        impact: violation.impact,
        nodes: violation.nodes,
        tags,
      },
      passed: false,
      ruleId: getWcagRuleFromTags(tags),
      ruleUrl: typeof violation.helpUrl === "string" ? violation.helpUrl : undefined,
      severity: mapImpactToSeverity(violation.impact),
    } satisfies AuditResult;
  });
}

function mapAfmAudit(step: WorkflowStepSummary): AuditResult[] {
  const sourceAudit = step.audits[0];
  const violations = Array.isArray(sourceAudit?.meta?.violations)
    ? (sourceAudit.meta.violations as Array<Record<string, unknown>>)
    : [];

  if (violations.length === 0) {
    return [
      {
        audit: "preview-afm-passed",
        category: "afm",
        message: sourceAudit?.message || "All readability checks passed.",
        passed: true,
        severity: "info",
      },
    ];
  }

  return violations.map((violation, index) => ({
    audit: `preview-afm-${String(violation.type || index)}`,
    category: "afm",
    current:
      Array.isArray(violation.details) && violation.details.length > 0
        ? String(violation.details[0])
        : undefined,
    message:
      typeof violation.description === "string"
        ? violation.description
        : sourceAudit?.message || "AFM issue found.",
    meta: {
      count: violation.count,
      details: violation.details,
      type: violation.type,
    },
    passed: false,
    severity: violation.severity === "error" ? "blocking" : "warning",
  }));
}

function mapWorkflowOutputToAudits(output: WorkflowOutput | undefined): AuditResult[] {
  if (!output) {
    return [];
  }

  const steps = output.summary?.checks || output.summary?.steps || [];
  const audits: AuditResult[] = [];

  const a11yStep = steps.find((step) => step.name === "preview-a11y-axe");
  if (a11yStep) {
    audits.push(...mapA11yAudit(a11yStep));
  }

  const afmStep = steps.find((step) => step.name === "preview-afm");
  if (afmStep) {
    audits.push(...mapAfmAudit(afmStep));
  }

  return audits;
}

function resolveSlug() {
  return sessionStorage.getItem(KEY_SLUG) || new URLSearchParams(window.location.search).get("slug");
}

async function requestStoryContext(): Promise<StoryContext> {
  const params = new URLSearchParams(window.location.search);
  const spaceIdFromQuery = params.get("space_id") ?? undefined;
  const storyIdFromQuery =
    params.get("story_id") ?? params.get("storyId") ?? params.get("id") ?? undefined;

  if (storyIdFromQuery) {
    return { spaceId: spaceIdFromQuery, storyId: storyIdFromQuery };
  }

  const slug = resolveSlug();
  if (!slug || window.top === window.self) {
    return { spaceId: spaceIdFromQuery };
  }

  return await new Promise<StoryContext>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ spaceId: spaceIdFromQuery });
    }, 2200);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== APP_BRIDGE_ORIGIN) {
        return;
      }

      const data = event.data as {
        action?: string;
        space_id?: number | string;
        spaceId?: number | string;
        story?: { id?: number | string };
      };

      if (data.action !== "get-context") {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);

      resolve({
        spaceId: String(data.space_id ?? data.spaceId ?? spaceIdFromQuery ?? "") || undefined,
        storyId: String(data.story?.id ?? "") || undefined,
      });
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      {
        action: "tool-changed",
        event: "getContext",
        tool: slug,
      },
      "*",
    );
  });
}

async function wait(ms: number) {
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

class WorkflowRunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Workflow run '${runId}' was not found.`);
    this.name = "WorkflowRunNotFoundError";
  }
}

function resolveRunIdFromUrl(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const fromQuery =
    params.get("runId") || params.get("run_id") || params.get("workflowRunId") || "";

  const runId = fromQuery.trim();
  return runId.length > 0 ? runId : undefined;
}

async function pollWorkflowOutput(runId: string): Promise<WorkflowOutput | undefined> {
  const apiBaseUrl = getApiBaseUrl();

  for (let attempt = 0; attempt < OUTPUT_POLL_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${apiBaseUrl}/api/workflows/${runId}/output`);
    if (response.status === 404) {
      throw new WorkflowRunNotFoundError(runId);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch workflow output (${response.status})`);
    }

    const json = (await response.json()) as WorkflowRunOutputResponse;
    if (json.status === "completed") {
      return json.output;
    }

    if (json.status === "failed" || json.status === "cancelled") {
      throw new Error(
        `Workflow run '${runId}' ended with status '${json.status}'. Check API logs for details (for example missing STORYBLOK_ACCESS_TOKEN).`,
      );
    }

    await wait(OUTPUT_POLL_DELAY_MS);
  }

  throw new Error("Timed out while waiting for workflow output.");
}

async function triggerWorkflowOnce(context: StoryContext): Promise<string> {
  if (!context.storyId || !context.spaceId) {
    throw new Error("Missing story context (storyId/spaceId) for workflow trigger.");
  }

  const now = Date.now();
  const lockTimestamp = Number(sessionStorage.getItem(WORKFLOW_TRIGGER_LOCK_KEY) || "0");
  const lockIsFresh = Number.isFinite(lockTimestamp) && now - lockTimestamp < 15_000;

  if (lockIsFresh) {
    throw new Error("Workflow trigger already in progress. Please wait a few seconds and retry.");
  }

  sessionStorage.setItem(WORKFLOW_TRIGGER_LOCK_KEY, String(now));

  try {
    const apiBaseUrl = getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/webhooks/storyblok/workflow-changed`, {
      body: JSON.stringify({
        id: context.storyId,
        spaceid: context.spaceId,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (response.status !== HTTP_STATUS_OK) {
      throw new Error(`Failed to trigger workflow (${response.status}).`);
    }

    const json = (await response.json()) as { runId?: string };
    if (!json.runId) {
      throw new Error("Workflow trigger response did not include runId.");
    }

    return json.runId;
  } finally {
    sessionStorage.removeItem(WORKFLOW_TRIGGER_LOCK_KEY);
  }
}

async function fetchAuditsFromExistingRun(): Promise<{ audits: AuditResult[]; runId: string }> {
  const runIdFromUrl = resolveRunIdFromUrl();
  const runIdFromSession = sessionStorage.getItem(LAST_WORKFLOW_RUN_ID_KEY) || undefined;

  const context = await requestStoryContext();

  const candidateRunIds = [...new Set([runIdFromUrl, runIdFromSession].filter(Boolean))] as string[];

  for (const runId of candidateRunIds) {
    try {
      const output = await pollWorkflowOutput(runId);
      sessionStorage.setItem(LAST_WORKFLOW_RUN_ID_KEY, runId);
      return {
        audits: mapWorkflowOutputToAudits(output),
        runId,
      };
    } catch (error) {
      if (error instanceof WorkflowRunNotFoundError) {
        if (runIdFromSession === runId) {
          sessionStorage.removeItem(LAST_WORKFLOW_RUN_ID_KEY);
        }
        continue;
      }

      throw error;
    }
  }

  const freshRunId = await triggerWorkflowOnce(context);
  sessionStorage.setItem(LAST_WORKFLOW_RUN_ID_KEY, freshRunId);

  const output = await pollWorkflowOutput(freshRunId);
  return {
    audits: mapWorkflowOutputToAudits(output),
    runId: freshRunId,
  };
}

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
        "inline-flex h-auto w-full items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition data-[state=active]:shadow-sm",
        "bg-white/50 hover:bg-white data-[state=active]:text-current",
        styles[status],
      )}
    >
      <Image src={CATEGORY_ICONS[category]} alt="" width={14} height={14} className="opacity-75" />
      <span className="font-bold">{CATEGORY_LABELS[category]}</span>
      <span className="text-zinc-500">
        {issueCount} issue{issueCount === 1 ? "" : "s"}
      </span>
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
      {remaining > 0 && (
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {remaining} issue{remaining === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ContentGuardPanel() {
  const [activeCategory, setActiveCategory] = useState<AuditCategory>("a11y");
  const [audits, setAudits] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const result = await fetchAuditsFromExistingRun();
        if (!cancelled) {
          setAudits(result.audits);
        }
      } catch (error) {
        if (!cancelled) {
          setAudits([]);
          setLoadError(error instanceof Error ? error.message : "Failed to load live audits.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const byCategory = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map((cat) => [cat, audits.filter((r) => r.category === cat)]),
      ) as Record<AuditCategory, AuditResult[]>,
    [audits],
  );

  const activeAudits = byCategory[activeCategory];

  return (
    <section className="w-full space-y-5 rounded-2xl border border-[var(--cg-border)] bg-white/80 shadow-lg shadow-zinc-200/40 backdrop-blur-sm">
      {/* Header */}
      <header className="flex items-center gap-3 rounded-xl border border-[var(--cg-border)] bg-[linear-gradient(130deg,#ebf8ef_0%,#faf8ec_100%)] px-4 py-3.5">
        <div>
          <Image src="/guard-icon.svg" alt="Content Guard" width={28} height={28} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold tracking-tight text-zinc-900">Content Guard</h1>
        </div>
        <ProgressSummary audits={activeAudits} />
      </header>

      {loading && (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Loading workflow output from API...
        </p>
      )}

      {!loading && loadError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {loadError}
        </p>
      )}

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
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <CategoryTabTrigger key={cat} category={cat} audits={byCategory[cat]} />
            ))}
          </TabsList>

          <div className="flex w-full justify-center">
            <button
              type="button"
              onClick={() => downloadResultsAsXlsx(byCategory)}
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            >
              Download XLSX
            </button>
          </div>
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
