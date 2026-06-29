import { HTTPError } from "h3";
import StoryblokClient from "storyblok-js-client";
import { z } from "zod";

import type { StoryblokWorkflowWebhookPayload } from "../server/audits/index.ts";

const HTTP_STATUS_BAD_GATEWAY = 502;
const HTTP_STATUS_BAD_REQUEST = 400;
const MIN_STRING_LENGTH = 1;
const STORYBLOK_DEFAULT_MANAGEMENT_API_BASE_URL = "https://mapi.storyblok.com/v1";

const managementEnvironmentSchema = z.object({
  location: z.string().optional(),
  name: z.string().optional(),
  url: z.string().optional(),
});

const managementSpaceResponseSchema = z.object({
  space: z.object({
    domain: z.string().optional(),
    environments: z.array(managementEnvironmentSchema).nullish(),
  }),
});

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length < MIN_STRING_LENGTH) {
    return undefined;
  }

  return trimmed;
};

const resolveSpaceId = (payload: StoryblokWorkflowWebhookPayload): string | number | undefined =>
  payload.space_id;

const resolveEnvironment = (payload: StoryblokWorkflowWebhookPayload): string | undefined =>
  asNonEmptyString(payload.environment) ?? asNonEmptyString(payload.environment_name);

const resolveInputUrl = (payload: StoryblokWorkflowWebhookPayload): string | undefined =>
  asNonEmptyString(payload.url);

const extractPathFromAbsoluteUrl = (value: string): string | undefined => {
  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
};

const normalizeRelativePath = (value: string): string => {
  if (value.startsWith("/")) {
    return value;
  }

  return `/${value}`;
};

const normalizePath = (rawUrl: string): string => {
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    const parsedPath = extractPathFromAbsoluteUrl(rawUrl);
    if (parsedPath !== undefined) {
      return parsedPath;
    }

    return "/";
  }

  return normalizeRelativePath(rawUrl);
};

const resolveManagementToken = (): string => {
  const token = asNonEmptyString(process.env.STORYBLOK_MANAGEMENT_TOKEN);
  if (token !== undefined) {
    return token;
  }

  const personalToken = asNonEmptyString(process.env.STORYBLOK_PAT);
  if (personalToken !== undefined) {
    return personalToken;
  }

  throw new HTTPError({
    message: "Missing Storyblok Management API token.",
    status: HTTP_STATUS_BAD_GATEWAY,
  });
};

const resolveManagementApiBaseUrl = (): string => {
  const configured = asNonEmptyString(process.env.STORYBLOK_MANAGEMENT_API_BASE_URL);
  if (configured === undefined) {
    return STORYBLOK_DEFAULT_MANAGEMENT_API_BASE_URL;
  }

  return configured.replace(/\/+$/u, "");
};

const getManagementClient = (): StoryblokClient =>
  new StoryblokClient({
    endpoint: resolveManagementApiBaseUrl(),
    oauthToken: resolveManagementToken(),
  });

const parseSpaceResponse = (value: unknown) => {
  const parsed = managementSpaceResponseSchema.safeParse(value);

  if (!parsed.success) {
    throw new HTTPError({
      message: "Invalid Storyblok space response.",
      status: HTTP_STATUS_BAD_GATEWAY,
    });
  }

  return parsed.data.space;
};

const fetchSpace = async (spaceId: number | string) => {
  const client = getManagementClient();

  try {
    const response = await client.get(`spaces/${String(spaceId)}`);
    return parseSpaceResponse(response.data);
  } catch {
    throw new HTTPError({
      message: "Failed to retrieve Storyblok space configuration.",
      status: HTTP_STATUS_BAD_GATEWAY,
    });
  }
};

const resolveEnvironmentName = (environment: z.output<typeof managementEnvironmentSchema>) => {
  const currentName = asNonEmptyString(environment.name);
  if (currentName === undefined) {
    return undefined;
  }

  return currentName.toLowerCase();
};

const resolveEnvironmentBaseUrl = (environment: z.output<typeof managementEnvironmentSchema>) => {
  const location = asNonEmptyString(environment.location);
  if (location !== undefined) {
    return location;
  }

  return asNonEmptyString(environment.url);
};

const findMatchingEnvironment = (
  environments: z.output<typeof managementEnvironmentSchema>[],
  environmentName: string,
) => {
  const normalizedEnvironment = environmentName.trim().toLowerCase();

  return environments.find((environment) => {
    const currentName = resolveEnvironmentName(environment);
    return currentName === normalizedEnvironment;
  });
};

const resolvePreviewBaseUrl = (
  space: z.output<typeof managementSpaceResponseSchema>["space"],
  environmentName: string,
): string | undefined => {
  const environments = space.environments ?? [];
  const matchingEnvironment = findMatchingEnvironment(environments, environmentName);
  if (matchingEnvironment !== undefined) {
    const baseUrl = resolveEnvironmentBaseUrl(matchingEnvironment);
    if (baseUrl !== undefined) {
      return baseUrl;
    }
  }

  return asNonEmptyString(space.domain);
};

const validateRequiredInputs = (
  payload: StoryblokWorkflowWebhookPayload,
): { environment: string; spaceId: string | number; urlPath: string } => {
  const environment = resolveEnvironment(payload);
  const spaceId = resolveSpaceId(payload);
  const urlPath = resolveInputUrl(payload);

  if (environment === undefined || spaceId === undefined || urlPath === undefined) {
    throw new HTTPError({
      message: "Missing required fields: spaceId, url, and environment.",
      status: HTTP_STATUS_BAD_REQUEST,
    });
  }

  return {
    environment,
    spaceId,
    urlPath,
  };
};

export const runResolvePreviewUrlStep = async (
  payload: StoryblokWorkflowWebhookPayload,
): Promise<StoryblokWorkflowWebhookPayload> => {
  "use step";

  const { environment, spaceId, urlPath } = validateRequiredInputs(payload);
  const space = await fetchSpace(spaceId);
  const previewBaseUrl = resolvePreviewBaseUrl(space, environment);

  if (previewBaseUrl === undefined) {
    throw new HTTPError({
      message: "Unable to resolve preview base URL for the provided environment.",
      status: HTTP_STATUS_BAD_REQUEST,
    });
  }

  const previewUrl = new URL(normalizePath(urlPath), previewBaseUrl).toString();

  return {
    ...payload,
    preview: {
      url: previewUrl,
    },
    preview_url: previewUrl,
    story: {
      ...payload.story,
      preview_url: previewUrl,
    },
  };
};
