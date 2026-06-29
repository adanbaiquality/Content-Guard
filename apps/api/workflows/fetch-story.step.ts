import type { AuditResult, StoryblokWorkflowWebhookPayload } from "../server/audits/index.ts";
import StoryblokClient from "storyblok-js-client";

const resolveStoryId = (payload: StoryblokWorkflowWebhookPayload): number | string | undefined => {
  const id = payload.story_id ?? payload.story?.id;
  return id;
};

const resolveExpectedStoryVersion = (
  payload: StoryblokWorkflowWebhookPayload,
): number | string | undefined => {
  const version = payload.story_version ?? payload.story?.version ?? payload.version;
  return version;
};

const MIN_NORMALIZED_STRING_LENGTH = 1;

const normalizeVersion = (value: number | string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  if (normalized.length >= MIN_NORMALIZED_STRING_LENGTH) {
    return normalized;
  }

  return undefined;
};

const extractFetchedStoryVersion = (story: unknown): string | undefined => {
  if (!story || typeof story !== "object" || !("version" in story)) {
    return undefined;
  }

  const rawVersion = (story as { version?: number | string }).version;
  return normalizeVersion(rawVersion);
};

const toNumericCv = (value: number | string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return undefined;
};

export const runFetchStoryAudit = async (
  payload: StoryblokWorkflowWebhookPayload,
): Promise<AuditResult> => {
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
      expectedVersionNormalized !== undefined &&
      fetchedVersion !== undefined &&
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
          fetchedVersion: undefined,
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
        expectedVersion: expectedVersion ?? undefined,
        fetchedVersion,
        name: data.story?.name,
        slug: data.story?.full_slug,
        storyId,
      },
      passed: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      audit: "fetch-story",
      message: "Failed to retrieve story from Storyblok.",
      meta: {
        error: errorMessage,
        storyId,
      },
      passed: false,
    };
  }
};
