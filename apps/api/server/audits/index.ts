export interface StoryblokReviewingInput {
  storyId: number | string;
  spaceId: number | string;
  timestamp?: number | string;
}

export interface StoryblokWorkflowWebhookPayload {
  story_id?: number | string;
  story_version?: number | string;
  version?: number | string;
  storyblok_rl?: number | string;
  release_id?: number | string;
  language_id?: number | string;
  lang?: number | string;
  language?: string;
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
    content?: {
      component?: string;
      [key: string]: unknown;
    } | unknown;
  };
  release?: {
    id?: number | string;
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
const DUMMY_STORYBLOK_QUERY_VALUE = "dummy-id";
const DUMMY_STORYBLOK_NUMERIC_VALUE = "1";
const DUMMY_STORYBLOK_LANGUAGE = "default";
const DUMMY_STORYBLOK_RELEASE = "0";

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

const asNumericString = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/u.test(trimmed)) {
      return trimmed;
    }
  }

  return undefined;
};

const normalizeUnixTimestampSeconds = (numeric: string): string => {
  const parsed = Number.parseInt(numeric, 10);

  if (!Number.isFinite(parsed)) {
    return numeric;
  }

  return numeric.length >= 13 ? String(Math.trunc(parsed / 1_000)) : String(parsed);
};

export const resolveStoryblokTimestamp = (value: unknown): string | undefined => {
  const numeric = asNumericString(value);
  if (numeric !== undefined) {
    return normalizeUnixTimestampSeconds(numeric);
  }

  const text = asNonEmptyString(value);
  if (text !== undefined) {
    const parsedDate = Date.parse(text);
    if (!Number.isNaN(parsedDate)) {
      return String(Math.floor(parsedDate / 1_000));
    }
  }

  return undefined;
};

const resolveUnixTimestamp = (value: unknown): string => {
  return resolveStoryblokTimestamp(value) ?? String(Math.floor(Date.now() / 1_000));
};

const resolveUnixTimestampMs = (value: unknown): string => {
  const numeric = asNumericString(value);
  if (numeric !== undefined) {
    return numeric;
  }

  const text = asNonEmptyString(value);
  if (text !== undefined) {
    const parsedDate = Date.parse(text);
    if (!Number.isNaN(parsedDate)) {
      return String(parsedDate);
    }
  }

  return String(Date.now());
};

export const resolvePreviewUrl = (payload: StoryblokWorkflowWebhookPayload): string | undefined => {
  const basePreviewUrl =
    asNonEmptyString(payload.preview_url) ??
    asNonEmptyString(payload.previewUrl) ??
    asNonEmptyString(payload.preview?.url) ??
    asNonEmptyString(payload.urls?.preview) ??
    asNonEmptyString(payload.story?.preview_url) ??
    asNonEmptyString(payload.story?.previewUrl);

  if (basePreviewUrl === undefined) {
    return undefined;
  }

  const storyId = asNumericString(payload.story_id) ?? asNumericString(payload.story?.id);

  try {
    const previewUrl = new URL(basePreviewUrl);

    if (storyId !== undefined) {
      previewUrl.searchParams.set("_storyblok", storyId);
    }

    const spaceId = asNumericString(payload.space_id) ?? DUMMY_STORYBLOK_NUMERIC_VALUE;
    const timestamp = resolveUnixTimestamp(payload.timestamp);
    const releaseTimestampMs = resolveUnixTimestampMs(payload.storyblok_rl);
    const releaseId =
      asNumericString(payload.release_id) ??
      asNumericString(payload.release?.id) ??
      DUMMY_STORYBLOK_RELEASE;
    const languageId =
      asNonEmptyString(payload.language) ??
      asNumericString(payload.language_id) ??
      asNumericString(payload.lang) ??
      DUMMY_STORYBLOK_LANGUAGE;
    const storyVersion =
      asNonEmptyString(String(payload.story_version ?? "")) ??
      asNonEmptyString(String(payload.version ?? "")) ??
      asNonEmptyString(String(payload.story?.version ?? "")) ??
      "";
    const contentType =
      asNonEmptyString((payload.story?.content as { component?: unknown } | undefined)?.component) ??
      DUMMY_STORYBLOK_QUERY_VALUE;

    previewUrl.searchParams.set("_storyblok_tk[space_id]", spaceId);
    previewUrl.searchParams.set("_storyblok_tk[timestamp]", timestamp);
    previewUrl.searchParams.set("_storyblok_tk[token]", DUMMY_STORYBLOK_QUERY_VALUE);
    previewUrl.searchParams.set("_storyblok_release", releaseId);
    previewUrl.searchParams.set("_storyblok_rl", releaseTimestampMs);
    previewUrl.searchParams.set("_storyblok_lang", languageId);
    previewUrl.searchParams.set("_storyblok_version", storyVersion);
    previewUrl.searchParams.set("_storyblok_c", contentType);

    return previewUrl.toString();
  } catch {
    return basePreviewUrl;
  }
};

export const isValidPreviewUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const reviewingAudits: Audit[] = [];

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
