import StoryblokClient from "storyblok-js-client";

import type {
  StoryblokReviewingInput,
  StoryblokWorkflowWebhookPayload,
} from "../server/audits/index.ts";
import { resolveStoryblokTimestamp } from "../server/audits/index.ts";

export const runFetchStoryStep = async (
  input: StoryblokReviewingInput,
): Promise<StoryblokWorkflowWebhookPayload> => {
  "use step";

  const accessToken = process.env.STORYBLOK_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("STORYBLOK_ACCESS_TOKEN environment variable is not set.");
  }

  const client = new StoryblokClient({ accessToken });
  const timestamp = resolveStoryblokTimestamp(input.timestamp);
  const { data } = await client.getStory(String(input.storyId), {
    ...(timestamp ? { cv: Number.parseInt(timestamp, 10) } : {}),
    version: "draft",
  });

  return {
    space_id: input.spaceId,
    story_id: input.storyId,
    timestamp,
    story: {
      id: data.story.id,
      uuid: data.story.uuid,
      name: data.story.name,
      slug: data.story.slug,
      full_slug: data.story.full_slug,
      content: data.story.content,
    },
    url: data.story.full_slug,
  };
};
