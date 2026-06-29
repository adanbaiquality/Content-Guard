import { and, eq, ne } from "drizzle-orm";

import {
  getContentGuardOrm,
  latestStoryRunsTable,
  runIdMappingsTable,
} from "./content-guard-orm.ts";

const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;

function normalizeRunId(runId: string): string {
  return runId.trim();
}

function normalizeSafeRunId(runId: string): string | undefined {
  const normalized = normalizeRunId(runId);

  if (!normalized || !SAFE_RUN_ID_PATTERN.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function normalizeStoryScopeId(value: string | number): string | undefined {
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function rememberLatestRunId(params: {
  publicRunId: string;
  spaceId: string | number;
  storyId: string | number;
  workflowRunId?: string;
}): void {
  const { publicRunId, spaceId, storyId, workflowRunId } = params;
  const normalizedPublicRunId = normalizeSafeRunId(publicRunId);
  const normalizedSpaceId = normalizeStoryScopeId(spaceId);
  const normalizedStoryId = normalizeStoryScopeId(storyId);

  if (!normalizedPublicRunId || !normalizedSpaceId || !normalizedStoryId) {
    return;
  }

  try {
    const db = getContentGuardOrm();
    const updatedAt = new Date().toISOString();

    db.insert(latestStoryRunsTable)
      .values({
        publicRunId: normalizedPublicRunId,
        spaceId: normalizedSpaceId,
        storyId: normalizedStoryId,
        updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          publicRunId: normalizedPublicRunId,
          updatedAt,
        },
        target: [latestStoryRunsTable.spaceId, latestStoryRunsTable.storyId],
      })
      .run();

    if (workflowRunId) {
      const normalizedWorkflowRunId = normalizeSafeRunId(workflowRunId);

      if (!normalizedWorkflowRunId) {
        return;
      }

      db.delete(runIdMappingsTable)
        .where(and(
          eq(runIdMappingsTable.workflowRunId, normalizedWorkflowRunId),
          ne(runIdMappingsTable.publicRunId, normalizedPublicRunId),
        ))
        .run();

      db.insert(runIdMappingsTable)
        .values({
          publicRunId: normalizedPublicRunId,
          updatedAt,
          workflowRunId: normalizedWorkflowRunId,
        })
        .onConflictDoUpdate({
          set: {
            updatedAt,
            workflowRunId: normalizedWorkflowRunId,
          },
          target: runIdMappingsTable.publicRunId,
        })
        .run();
    }
  } catch {
    // Fail open for local cache bookkeeping; request flow should continue.
  }
}

export function getLatestRunId(params: {
  spaceId: string | number;
  storyId: string | number;
}): string | undefined {
  const { spaceId, storyId } = params;
  const normalizedSpaceId = normalizeStoryScopeId(spaceId);
  const normalizedStoryId = normalizeStoryScopeId(storyId);

  if (!normalizedSpaceId || !normalizedStoryId) {
    return undefined;
  }

  try {
    const db = getContentGuardOrm();

    const row = db.select({ publicRunId: latestStoryRunsTable.publicRunId })
      .from(latestStoryRunsTable)
      .where(and(
        eq(latestStoryRunsTable.spaceId, normalizedSpaceId),
        eq(latestStoryRunsTable.storyId, normalizedStoryId),
      ))
      .limit(1)
      .get();

    return typeof row?.publicRunId === "string" ? row.publicRunId : undefined;
  } catch {
    return undefined;
  }
}

export function resolveWorkflowRunId(runId: string): string {
  const normalizedRunId = normalizeSafeRunId(runId);

  if (!normalizedRunId) {
    return normalizeRunId(runId);
  }

  try {
    const db = getContentGuardOrm();

    const row = db.select({ workflowRunId: runIdMappingsTable.workflowRunId })
      .from(runIdMappingsTable)
      .where(eq(runIdMappingsTable.publicRunId, normalizedRunId))
      .limit(1)
      .get();

    return typeof row?.workflowRunId === "string" ? row.workflowRunId : normalizedRunId;
  } catch {
    return normalizedRunId;
  }
}

export function resolvePublicRunId(workflowRunId: string): string | undefined {
  const normalizedWorkflowRunId = normalizeSafeRunId(workflowRunId);

  if (!normalizedWorkflowRunId) {
    return undefined;
  }

  try {
    const db = getContentGuardOrm();

    const row = db.select({ publicRunId: runIdMappingsTable.publicRunId })
      .from(runIdMappingsTable)
      .where(eq(runIdMappingsTable.workflowRunId, normalizedWorkflowRunId))
      .limit(1)
      .get();

    return typeof row?.publicRunId === "string" ? row.publicRunId : undefined;
  } catch {
    return undefined;
  }
}
