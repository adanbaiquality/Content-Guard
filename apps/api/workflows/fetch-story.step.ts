import StoryblokClient from "storyblok-js-client";
import type {
  AuditResult,
  StoryblokWorkflowWebhookPayload,
} from "../server/audits/index.ts";

function resolveStoryId(payload: StoryblokWorkflowWebhookPayload): number | string | null {
  const id = payload.story_id ?? payload.story?.id ?? null;
  return id ?? null;
}

function resolveExpectedStoryVersion(
  payload: StoryblokWorkflowWebhookPayload,
): number | string | null {
  const version = payload.story_version ?? payload.story?.version ?? payload.version ?? null;
  return version ?? null;
}

function normalizeVersion(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function extractFetchedStoryVersion(story: unknown): string | null {
  if (!story || typeof story !== "object" || !("version" in story)) {
    return null;
  }

  const rawVersion = (story as { version?: number | string }).version;
  return normalizeVersion(rawVersion);
}

function toNumericCv(value: number | string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export async function runFetchStoryAudit(
  payload: StoryblokWorkflowWebhookPayload,
): Promise<AuditResult> {
  "use step";

  const storyId = resolveStoryId(payload);
  const expectedVersion = resolveExpectedStoryVersion(payload);

  if (!storyId) {
    return {
      audit: "fetch-story",
      message: "Missing story ID in webhook payload.",
      meta: { expectedFields: ["story_id", "story.id"] },
      passed: false,
    };
  }

  const accessToken = process.env.STORYBLOK_ACCESS_TOKEN;

  if (!accessToken) {
    return {
      audit: "fetch-story",
      message: "STORYBLOK_ACCESS_TOKEN environment variable is not set.",
      passed: false,
    };
  }

  const client = new StoryblokClient({ accessToken });

  try {
    const requestParams = { cv: toNumericCv(expectedVersion), version: "draft" as const };
    const { data } = await client.getStory(String(storyId), requestParams);

    const fetchedVersion = extractFetchedStoryVersion(data.story);
    const expectedVersionNormalized = normalizeVersion(expectedVersion);

    if (
      expectedVersionNormalized !== null &&
      fetchedVersion !== null &&
      expectedVersionNormalized !== fetchedVersion
    ) {
      return {
        audit: "fetch-story",
        message: "Retrieved story version does not match webhook payload version.",
        meta: {
          expectedVersion: expectedVersionNormalized,
          fetchedVersion,
          name: data.story?.name,
          slug: data.story?.full_slug,
          storyId,
        },
        passed: false,
      };
    }

    if (expectedVersionNormalized !== null && fetchedVersion === null) {
      return {
        audit: "fetch-story",
        message: "Story retrieved but version could not be verified.",
        meta: {
          expectedVersion: expectedVersionNormalized,
          fetchedVersion: null,
          name: data.story?.name,
          slug: data.story?.full_slug,
          storyId,
        },
        passed: false,
      };
    }

    return {
      audit: "fetch-story",
      message: "Story retrieved successfully from Storyblok.",
      meta: {
        expectedVersion: expectedVersion ?? null,
        fetchedVersion,
        name: data.story?.name,
        slug: data.story?.full_slug,
        storyId,
      },
      passed: true,
    };
  } catch (error) {
    return {
      audit: "fetch-story",
      message: "Failed to retrieve story from Storyblok.",
      meta: {
        error: error instanceof Error ? error.message : String(error),
        storyId,
      },
      passed: false,
    };
  }
}
