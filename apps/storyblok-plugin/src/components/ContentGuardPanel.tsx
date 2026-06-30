import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import CategorySection from "@/components/AccessibilitySection";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { mockCategorySettingsLinks } from "@/mocks/auditResults";
import { type AuditCategory, type AuditResult } from "@/types";
import { getApiBaseUrl } from "@/utils/api";
import { APP_BRIDGE_ORIGIN, KEY_PARENT_HOST, KEY_SLUG, KEY_VALIDATED_PAYLOAD } from "@/utils/const";

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

const AFM_KREDIETWAARSCHUWING_DOC_URL =
  "https://www.afm.nl/nl-nl/sector/themas/dienstverlening-aan-consumenten/informatieverstrekking/kredietwaarschuwing";

function getAfmRuleInfo(type: unknown): { ruleId: string; ruleUrl: string } {
  const violationType = typeof type === "string" ? type : "";

  const afmRuleMap: Record<string, { ruleId: string; ruleUrl: string }> = {
    "kredietwaarschuwing-position-size": {
      ruleId: "kredietwaarschuwing",
      ruleUrl: AFM_KREDIETWAARSCHUWING_DOC_URL,
    },
    "kredietwaarschuwing-source": {
      ruleId: "kredietwaarschuwing",
      ruleUrl: AFM_KREDIETWAARSCHUWING_DOC_URL,
    },
    "kredietwaarschuwing-visibility": {
      ruleId: "kredietwaarschuwing",
      ruleUrl: AFM_KREDIETWAARSCHUWING_DOC_URL,
    },
    "missing-kredietwaarschuwing": {
      ruleId: "kredietwaarschuwing",
      ruleUrl: AFM_KREDIETWAARSCHUWING_DOC_URL,
    },
  };

  return (
    afmRuleMap[violationType] || {
      ruleId: "kredietwaarschuwing",
      ruleUrl: AFM_KREDIETWAARSCHUWING_DOC_URL,
    }
  );
}

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
  timestamps?: {
    completedAt?: string;
    createdAt: string;
    startedAt?: string;
  };
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

type LoadedAuditsResult = {
  audits: AuditResult[];
  lastRunAt?: string;
  runId: string;
};

function getWcagRuleFromTags(tags: string[]): string | undefined {
  const wcagTag = tags.find((tag) => /^wcag\d{3}$/.test(tag));
  if (!wcagTag) {
    return undefined;
  }

  const digits = wcagTag.slice("wcag".length);
  return `WCAG ${digits[0]}.${digits[1]}.${digits[2]}`;
}

function mapImpactToSeverity(impact: unknown): AuditResult["severity"] {
  if (impact === "critical") {
    return "critical";
  }

  if (impact === "serious") {
    return "serious";
  }

  if (impact === "moderate") {
    return "moderate";
  }

  return "minor";
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
        severity: "minor",
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
        severity: "minor",
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
    ruleId: getAfmRuleInfo(violation.type).ruleId,
    ruleUrl: getAfmRuleInfo(violation.type).ruleUrl,
    severity:
      violation.severity === "error"
        ? "serious"
        : violation.severity === "warning"
          ? "moderate"
          : "minor",
  }));
}

function mapBrandSeverity(severity: unknown): AuditResult["severity"] {
  if (typeof severity !== "string") {
    return "moderate";
  }

  switch (severity.toLowerCase()) {
    case "critical":
      return "critical";
    case "serious":
    case "high":
      return "serious";
    case "moderate":
    case "medium":
      return "moderate";
    case "minor":
    case "low":
    case "info":
      return "minor";
    default:
      return "moderate";
  }
}

function mapBrandAudit(step: WorkflowStepSummary): AuditResult[] {
  const sourceAudit = step.audits[0];
  const violations = Array.isArray(sourceAudit?.meta?.violations)
    ? (sourceAudit.meta.violations as Array<Record<string, unknown>>)
    : [];

  if (violations.length === 0) {
    if (!sourceAudit?.passed) {
      return [
        {
          audit: "preview-style-guide-error",
          category: "brand",
          message: sourceAudit?.message || "Brand audit failed.",
          meta: sourceAudit?.meta,
          passed: false,
          severity: "serious",
        },
      ];
    }

    return [
      {
        audit: "preview-style-guide-passed",
        category: "brand",
        message: sourceAudit?.message || "No brand or tone issues found.",
        passed: true,
        severity: "minor",
      },
    ];
  }

  return violations.map((violation, index) => {
    const guideline =
      typeof violation.guideline === "string" && violation.guideline.trim().length > 0
        ? violation.guideline.trim()
        : undefined;

    const explanation =
      typeof violation.explanation === "string" && violation.explanation.trim().length > 0
        ? violation.explanation.trim()
        : sourceAudit?.message || "Brand style guideline issue found.";

    const excerpt =
      typeof violation.excerpt === "string" && violation.excerpt.trim().length > 0
        ? violation.excerpt.trim()
        : undefined;

    return {
      audit: `preview-style-guide-${index}`,
      category: "brand",
      current: excerpt,
      message: explanation,
      meta: {
        excerpt: violation.excerpt,
        explanation: violation.explanation,
        guideline: violation.guideline,
        severity: violation.severity,
      },
      passed: false,
      ruleId: guideline,
      severity: mapBrandSeverity(violation.severity),
    } satisfies AuditResult;
  });
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

  const brandStep = steps.find((step) => step.name === "preview-style-guide");
  if (brandStep) {
    audits.push(...mapBrandAudit(brandStep));
  }

  return audits;
}

function resolveSlug() {
  return sessionStorage.getItem(KEY_SLUG) || new URLSearchParams(window.location.search).get("slug");
}

function readQueryValue(params: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = params.get(key);
    if (!raw) {
      continue;
    }

    const value = raw.trim();
    if (value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function resolveSpaceIdFromValidatedPayload(): string | undefined {
  try {
    const raw = sessionStorage.getItem(KEY_VALIDATED_PAYLOAD);
    if (!raw) {
      return undefined;
    }

    const payload = JSON.parse(raw) as { space_id?: number | string };
    if (payload.space_id === undefined || payload.space_id === null) {
      return undefined;
    }

    const spaceId = String(payload.space_id).trim();
    return spaceId.length > 0 ? spaceId : undefined;
  } catch {
    return undefined;
  }
}

function resolveParentHostForPostMessage(): string {
  const storedParentHost = sessionStorage.getItem(KEY_PARENT_HOST);
  if (storedParentHost) {
    return storedParentHost;
  }

  const params = new URLSearchParams(window.location.search);
  const protocol = params.get("protocol");
  const host = params.get("host");
  if (protocol && host) {
    return `${protocol}//${host}`;
  }

  return "*";
}

async function requestStoryContext(): Promise<StoryContext> {
  const params = new URLSearchParams(window.location.search);
  const spaceIdFromQuery = readQueryValue(params, [
    "space_id",
    "spaceId",
    "spaceid",
    "_storyblok_tk[space_id]",
    "_storyblok_tk[spaceid]",
  ]);
  const storyIdFromQuery = readQueryValue(params, [
    "story_id",
    "storyId",
    "storyid",
    "id",
    "_storyblok",
    "_storyblok_tk[story_id]",
    "_storyblok_tk[storyid]",
  ]);
  const spaceIdFromSession = resolveSpaceIdFromValidatedPayload();

  if (storyIdFromQuery) {
    return { spaceId: spaceIdFromQuery ?? spaceIdFromSession, storyId: storyIdFromQuery };
  }

  const slug = resolveSlug();
  if (!slug || window.top === window.self) {
    return { spaceId: spaceIdFromQuery ?? spaceIdFromSession };
  }

  return await new Promise<StoryContext>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ spaceId: spaceIdFromQuery ?? spaceIdFromSession });
    }, 2200);

    const onMessage = (event: MessageEvent) => {
      const parentHost = resolveParentHostForPostMessage();
      const allowedOrigin = parentHost !== "*" ? parentHost : APP_BRIDGE_ORIGIN;
      if (event.origin !== APP_BRIDGE_ORIGIN && event.origin !== allowedOrigin) {
        return;
      }

      const data = event.data as {
        action?: string;
        event?: string;
        id?: number | string;
        space_id?: number | string;
        spaceId?: number | string;
        spaceid?: number | string;
        story_id?: number | string;
        storyId?: number | string;
        storyid?: number | string;
        story?: { id?: number | string };
      };

      const hasContextPayload = Boolean(
        data.story?.id || data.story_id || data.storyId || data.storyid || data.id,
      );
      if (!hasContextPayload && data.action !== "get-context" && data.event !== "get-context") {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);

      const resolvedSpaceId = String(
        data.space_id ?? data.spaceId ?? data.spaceid ?? spaceIdFromQuery ?? spaceIdFromSession ?? "",
      ).trim();
      const resolvedStoryId = String(
        data.story?.id ?? data.story_id ?? data.storyId ?? data.storyid ?? data.id ?? "",
      ).trim();

      resolve({
        spaceId: resolvedSpaceId || undefined,
        storyId: resolvedStoryId || undefined,
      });
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      {
        action: "tool-changed",
        event: "getContext",
        tool: slug,
      },
      resolveParentHostForPostMessage(),
    );
  });
}

async function wait(ms: number) {
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function resolveLastRunAt(response: WorkflowRunOutputResponse | undefined): string | undefined {
  if (!response?.timestamps) {
    return undefined;
  }

  return response.timestamps.completedAt || response.timestamps.startedAt || response.timestamps.createdAt;
}

function formatLastRunAt(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
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

function resolveTimestampFromUrl(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("timestamp") || params.get("_storyblok_tk[timestamp]") || "";
  const timestamp = fromQuery.trim();
  return timestamp.length > 0 ? timestamp : undefined;
}

async function pollWorkflowOutput(runId: string): Promise<WorkflowRunOutputResponse> {
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
      return json;
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
        timestamp: resolveTimestampFromUrl(),
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

async function fetchLatestWorkflowOutput(
  context: StoryContext,
): Promise<WorkflowRunOutputResponse | undefined> {
  if (!context.storyId || !context.spaceId) {
    return undefined;
  }

  const apiBaseUrl = getApiBaseUrl();
  const params = new URLSearchParams({
    id: context.storyId,
    spaceid: context.spaceId,
  });

  const response = await fetch(`${apiBaseUrl}/api/workflows/latest?${params.toString()}`);

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Failed to resolve latest workflow run (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as WorkflowRunOutputResponse;
  }

  const html = await response.text();
  const runIdMatch = html.match(/\/api\/workflows\/([^/]+)\/output/i);
  const runId = runIdMatch?.[1];

  if (!runId) {
    throw new Error("Latest workflow response did not include a runId.");
  }

  const outputResponse = await fetch(`${apiBaseUrl}/api/workflows/${runId}/output`);
  if (!outputResponse.ok) {
    throw new Error(`Failed to fetch latest workflow output (${outputResponse.status}).`);
  }

  return (await outputResponse.json()) as WorkflowRunOutputResponse;
}

async function fetchAuditsFromExistingRun(): Promise<LoadedAuditsResult> {
  const runIdFromUrl = resolveRunIdFromUrl();
  const runIdFromSession = sessionStorage.getItem(LAST_WORKFLOW_RUN_ID_KEY) || undefined;

  const context = await requestStoryContext();
  const hasStoryContext = Boolean(context.storyId && context.spaceId);

  let latestOutput: WorkflowRunOutputResponse | undefined;
  try {
    latestOutput = await fetchLatestWorkflowOutput(context);
  } catch {
    // API may briefly restart in dev. Fall back to fresh trigger below.
    latestOutput = undefined;
  }

  if (latestOutput?.runId) {
    const latestRunId = latestOutput.runId;

    if (latestOutput.status === "completed") {
      sessionStorage.setItem(LAST_WORKFLOW_RUN_ID_KEY, latestRunId);
      return {
        audits: mapWorkflowOutputToAudits(latestOutput.output),
        lastRunAt: resolveLastRunAt(latestOutput),
        runId: latestRunId,
      };
    }

    if (latestOutput.status === "failed" || latestOutput.status === "cancelled") {
      throw new Error(
        `Workflow run '${latestRunId}' ended with status '${latestOutput.status}'. Check API logs for details.`,
      );
    }

    try {
      const polledResponse = await pollWorkflowOutput(latestRunId);
      sessionStorage.setItem(LAST_WORKFLOW_RUN_ID_KEY, latestRunId);
      return {
        audits: mapWorkflowOutputToAudits(polledResponse.output),
        lastRunAt: resolveLastRunAt(polledResponse),
        runId: latestRunId,
      };
    } catch {
      // If latest run lookup fails transiently, recover with a fresh run below.
    }
  }

  // If latest cache is empty (for example after API restart), avoid reusing stale
  // URL/session run ids and generate a fresh run for the current story context.
  if (hasStoryContext) {
    const freshRunId = await triggerWorkflowOnce(context);
    sessionStorage.setItem(LAST_WORKFLOW_RUN_ID_KEY, freshRunId);

    const response = await pollWorkflowOutput(freshRunId);
    return {
      audits: mapWorkflowOutputToAudits(response.output),
      lastRunAt: resolveLastRunAt(response),
      runId: freshRunId,
    };
  }

  const candidateRunIds = [...new Set([runIdFromUrl, runIdFromSession].filter(Boolean))] as string[];

  for (const runId of candidateRunIds) {
    try {
      const response = await pollWorkflowOutput(runId);
      sessionStorage.setItem(LAST_WORKFLOW_RUN_ID_KEY, runId);
      return {
        audits: mapWorkflowOutputToAudits(response.output),
        lastRunAt: resolveLastRunAt(response),
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

  const response = await pollWorkflowOutput(freshRunId);
  return {
    audits: mapWorkflowOutputToAudits(response.output),
    lastRunAt: resolveLastRunAt(response),
    runId: freshRunId,
  };
}

function getCategoryStatus(audits: AuditResult[]) {
  const failing = audits.filter((a) => !a.passed);
  if (failing.length === 0) return "pass";
  if (failing.some((a) => a.severity === "critical")) return "critical";
  if (failing.some((a) => a.severity === "serious")) return "serious";
  if (failing.some((a) => a.severity === "moderate")) return "moderate";
  return "minor";
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

const EXPORT_SEVERITY_RANK: Record<AuditResult["severity"], number> = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
};

function sortAuditsForExport(audits: AuditResult[]): AuditResult[] {
  return [...audits].sort((a, b) => {
    const severityDelta = EXPORT_SEVERITY_RANK[b.severity] - EXPORT_SEVERITY_RANK[a.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    if (a.passed !== b.passed) {
      return a.passed ? 1 : -1;
    }

    return a.audit.localeCompare(b.audit);
  });
}

function downloadResultsAsXlsx(byCategory: Record<AuditCategory, AuditResult[]>) {
  const workbook = XLSX.utils.book_new();

  const allRows = CATEGORIES.flatMap((category) =>
    sortAuditsForExport(byCategory[category]).map((result) => toExportRow(category, result)),
  );

  const allResultsSheet = XLSX.utils.json_to_sheet(allRows);
  XLSX.utils.book_append_sheet(workbook, allResultsSheet, "All Results");

  CATEGORIES.forEach((category) => {
    const rows = sortAuditsForExport(byCategory[category]).map((result) =>
      toExportRow(category, result),
    );

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
    pass: "border-emerald-200 text-zinc-900 data-[state=active]:bg-emerald-50",
    critical: "border-red-200 text-zinc-900 data-[state=active]:bg-red-50",
    serious: "border-orange-200 text-zinc-900 data-[state=active]:bg-orange-50",
    moderate: "border-amber-200 text-zinc-900 data-[state=active]:bg-amber-50",
    minor: "border-sky-200 text-zinc-900 data-[state=active]:bg-sky-50",
  };

  const dotStyles = {
    pass: "bg-emerald-500",
    critical: "bg-red-500",
    serious: "bg-orange-500",
    moderate: "bg-amber-500",
    minor: "bg-sky-500",
  };

  return (
    <TabsTrigger
      value={category}
      className={cn(
        "grid h-auto w-full grid-cols-[14px_minmax(0,1fr)_96px_8px] items-center gap-2 rounded-full border px-3 py-1.5 text-[0.9rem] font-semibold transition data-[state=active]:shadow-sm",
        "bg-white/50 hover:bg-white data-[state=active]:text-current",
        styles[status],
      )}
    >
      <Image src={CATEGORY_ICONS[category]} alt="" width={14} height={14} className="opacity-75" />
      <span className="min-w-0 truncate text-left text-[1rem] font-bold">{CATEGORY_LABELS[category]}</span>
      <span className="text-right tabular-nums text-[1.05rem] font-bold text-zinc-700">
        {issueCount} issue{issueCount === 1 ? "" : "s"}
      </span>
      <span className={`h-2 w-2 rounded-full ${dotStyles[status]}`} />
    </TabsTrigger>
  );
}

function ProgressSummary({ audits }: { audits: AuditResult[] }) {
  const issueCount = audits.filter((a) => !a.passed).length;
  const isAllGood = issueCount === 0;
  const status = getCategoryStatus(audits);

  const severityStyles = {
    pass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    critical: "border-red-200 bg-red-100 text-red-900",
    serious: "border-red-200 bg-red-100 text-red-900",
    moderate: "border-orange-200 bg-orange-100 text-orange-900",
    minor: "border-amber-200 bg-amber-100 text-amber-900",
  };

  return (
    <div
      className={cn(
        "flex min-h-12 items-center rounded-xl border px-4 py-2",
        severityStyles[status],
      )}
    >
      <p className="text-[1.2rem] leading-none font-extrabold">
        {isAllGood ? "everything ok" : `${issueCount} issue${issueCount === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}

function PanelLoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <Skeleton className="h-9 rounded-full" />
          <Skeleton className="h-9 rounded-full" />
          <Skeleton className="h-9 rounded-full" />
        </div>
        <div className="flex w-full justify-center">
          <Skeleton className="h-8 w-36 rounded-full" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </div>
  );
}

function HeaderLoadingSkeleton() {
  return (
    <header className="flex items-center gap-3 rounded-xl border border-[var(--cg-border)] bg-white/80 px-4 py-3.5">
      <Skeleton className="h-7 w-7 rounded-md" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-[var(--cg-border)] bg-white/80 px-3 py-2">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    </header>
  );
}

export default function ContentGuardPanel() {
  const [activeCategory, setActiveCategory] = useState<AuditCategory>("a11y");
  const [audits, setAudits] = useState<AuditResult[]>([]);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [isRunTooltipPinned, setIsRunTooltipPinned] = useState(false);
  const [isRunTooltipHovered, setIsRunTooltipHovered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const runTooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const result = await fetchAuditsFromExistingRun();
        if (!cancelled) {
          setAudits(result.audits);
          setLastRunId(result.runId);
          setLastRunAt(result.lastRunAt ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setAudits([]);
          setLastRunId(null);
          setLastRunAt(null);
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

  useEffect(() => {
    if (!isRunTooltipPinned) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!runTooltipRef.current?.contains(event.target as Node)) {
        setIsRunTooltipPinned(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsRunTooltipPinned(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isRunTooltipPinned]);

  const byCategory = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map((cat) => [cat, audits.filter((r) => r.category === cat)]),
      ) as Record<AuditCategory, AuditResult[]>,
    [audits],
  );

  const activeAudits = byCategory[activeCategory];
  const formattedLastRunAt = formatLastRunAt(lastRunAt ?? undefined);
  const shouldShowRunTooltip = (isRunTooltipHovered || isRunTooltipPinned) && Boolean(lastRunId);

  return (
    <section className="w-full space-y-5 rounded-2xl border border-[var(--cg-border)] bg-white/80 shadow-lg shadow-zinc-200/40 backdrop-blur-sm">
      {loading ? (
        <HeaderLoadingSkeleton />
      ) : (
        <header className="flex items-center gap-3 rounded-xl border border-[var(--cg-border)] bg-white/80 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            {formattedLastRunAt && (
              <div
                ref={runTooltipRef}
                className="relative inline-flex"
                onMouseEnter={() => setIsRunTooltipHovered(true)}
                onMouseLeave={() => setIsRunTooltipHovered(false)}
              >
                <button
                  type="button"
                  onClick={() => setIsRunTooltipPinned((current) => !current)}
                  className="text-[10px] font-normal text-zinc-500 transition-colors hover:text-zinc-600"
                >
                  Last run: {formattedLastRunAt}
                </button>

                {shouldShowRunTooltip && (
                  <div className="absolute top-full left-0 z-10 mt-1 max-w-[280px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[10px] text-zinc-600 shadow-md">
                    Run ID: {lastRunId}
                  </div>
                )}
              </div>
            )}
          </div>
          <ProgressSummary audits={audits} />
        </header>
      )}

      {loading && <PanelLoadingSkeleton />}

      {!loading && loadError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {loadError}
        </p>
      )}

      {!loading && (
        <>
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

              <div className="w-full">
                <button
                  type="button"
                  onClick={() => downloadResultsAsXlsx(byCategory)}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-300 bg-white px-5 py-2.5 text-lg font-semibold text-slate-800 shadow-sm transition hover:bg-zinc-50 active:scale-[0.99] active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  Download Report
                </button>
              </div>
            </div>
          </Tabs>

          {/* Active category section */}
          <div className="space-y-5">
            <CategorySection
              category={activeCategory}
              audits={activeAudits}
            />
          </div>
        </>
      )}
    </section>
  );
}
