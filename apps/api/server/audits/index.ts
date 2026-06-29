export interface StoryblokReviewingInput {
  storyId: number | string;
  spaceId: number | string;
}

export interface StoryblokWorkflowWebhookPayload {
  story_id?: number | string;
  story_version?: number | string;
  version?: number | string;
  preview_url?: string;
  previewUrl?: string;
  preview?: {
    url?: string;
  };
  urls?: {
    preview?: string;
  };
  story?: {
    id?: number | string;
    version?: number | string;
    uuid?: string;
    name?: string;
    slug?: string;
    full_slug?: string;
    preview_url?: string;
    previewUrl?: string;
    content?: unknown;
  };
  workflow?: {
    state?: string;
    name?: string;
  };
  workflow_state?: string;
  state?: string;
  space_id?: number | string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface AuditResult {
  audit: string;
  passed: boolean;
  message: string;
  meta?: Record<string, unknown>;
  step?: string;
}

export interface Audit {
  name: string;
  run: (payload: StoryblokWorkflowWebhookPayload) => Promise<AuditResult>;
}

const MIN_STRING_LENGTH = 1;

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length >= MIN_STRING_LENGTH) {
    return trimmed;
  }

  return undefined;
};

export const resolvePreviewUrl = (payload: StoryblokWorkflowWebhookPayload): string | undefined =>
  asNonEmptyString(payload.preview_url) ??
  asNonEmptyString(payload.previewUrl) ??
  asNonEmptyString(payload.preview?.url) ??
  asNonEmptyString(payload.urls?.preview) ??
  asNonEmptyString(payload.story?.preview_url) ??
  asNonEmptyString(payload.story?.previewUrl);

export const isValidPreviewUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const hasStoryIdentifierAudit: Audit = {
  name: "has-story-identifier",
  async run(payload) {
    const storyId = payload.story_id ?? payload.story?.id;
    const hasId = storyId !== undefined;
    const hasLength = String(storyId).length > 0;
    const passed = hasId && hasLength;

    const message = passed
      ? "Story identifier found in webhook payload."
      : "Missing story identifier (expected story_id or story.id).";

    return {
      audit: "has-story-identifier",
      message,
      meta: {
        storyId: storyId ?? undefined,
      },
      passed,
    };
  },
};

const MIN_AVAILABLE_FIELDS = 1;

const hasStoryMetadataAudit: Audit = {
  name: "has-story-metadata",
  async run(payload) {
    const story = payload.story ?? {};
    const available = [story.name, story.slug, story.full_slug, story.uuid].filter(Boolean).length;

    const passed = available >= MIN_AVAILABLE_FIELDS;

    const message = passed
      ? "Story metadata is present for downstream audits."
      : "No story metadata found (name/slug/full_slug/uuid).";

    return {
      audit: "has-story-metadata",
      message,
      meta: {
        availableFields: available,
      },
      passed,
    };
  },
};

export const reviewingAudits: Audit[] = [hasStoryIdentifierAudit, hasStoryMetadataAudit];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const runReviewingAudits = async (
  payload: StoryblokWorkflowWebhookPayload,
): Promise<AuditResult[]> => {
  const results = await Promise.all(
    reviewingAudits.map(async (audit) => {
      try {
        return await audit.run(payload);
      } catch (error) {
        return {
          audit: audit.name,
          message: "Audit execution failed.",
          meta: {
            error: getErrorMessage(error),
          },
          passed: false,
        } satisfies AuditResult;
      }
    }),
  );

  return results;
};
