export type StoryblokWorkflowWebhookPayload = {
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
};

export type AuditResult = {
  audit: string;
  passed: boolean;
  message: string;
  meta?: Record<string, unknown>;
};

export type Audit = {
  name: string;
  run: (payload: StoryblokWorkflowWebhookPayload) => Promise<AuditResult>;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function resolvePreviewUrl(payload: StoryblokWorkflowWebhookPayload): string | null {
  return (
    asNonEmptyString(payload.preview_url) ??
    asNonEmptyString(payload.previewUrl) ??
    asNonEmptyString(payload.preview?.url) ??
    asNonEmptyString(payload.urls?.preview) ??
    asNonEmptyString(payload.story?.preview_url) ??
    asNonEmptyString(payload.story?.previewUrl) ??
    null
  );
}

export function isValidPreviewUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const hasStoryIdentifierAudit: Audit = {
  name: "has-story-identifier",
  async run(payload) {
    const storyId = payload.story_id ?? payload.story?.id;
    const passed = storyId !== undefined && storyId !== null && String(storyId).length > 0;

    return {
      audit: "has-story-identifier",
      passed,
      message: passed
        ? "Story identifier found in webhook payload."
        : "Missing story identifier (expected story_id or story.id).",
      meta: {
        storyId: storyId ?? null,
      },
    };
  },
};

const hasStoryMetadataAudit: Audit = {
  name: "has-story-metadata",
  async run(payload) {
    const story = payload.story ?? {};
    const available = [story.name, story.slug, story.full_slug, story.uuid].filter(Boolean).length;

    const passed = available > 0;

    return {
      audit: "has-story-metadata",
      passed,
      message: passed
        ? "Story metadata is present for downstream audits."
        : "No story metadata found (name/slug/full_slug/uuid).",
      meta: {
        availableFields: available,
      },
    };
  },
};

export const reviewingAudits: Audit[] = [
  hasStoryIdentifierAudit,
  hasStoryMetadataAudit,
];

export async function runReviewingAudits(
  payload: StoryblokWorkflowWebhookPayload,
): Promise<AuditResult[]> {
  const results = await Promise.all(
    reviewingAudits.map(async (audit) => {
      try {
        return await audit.run(payload);
      } catch (error) {
        return {
          audit: audit.name,
          passed: false,
          message: "Audit execution failed.",
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        } satisfies AuditResult;
      }
    }),
  );

  return results;
}
