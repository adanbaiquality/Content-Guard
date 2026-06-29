// eslint-disable-next-line sort-imports
import { getSessionStore, inferSessionQuery } from "@storyblok/app-extension-auth";
import type { NextApiRequest, NextApiResponse } from "next";

import { authParams } from "@/auth";

export const getAppSession = async (req: NextApiRequest, res: NextApiResponse) => {
  const sessionStore = getSessionStore(authParams)({
    req,
    res,
  });

  const appSessionQuery = inferSessionQuery(req);
  if (!appSessionQuery) {
    return;
  }
  await sessionStore.get(appSessionQuery);
  return;
};
