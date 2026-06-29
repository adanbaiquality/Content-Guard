import type { NextApiRequest, NextApiResponse } from "next";
import { handleConnect } from "@/auth";

export const config = {
  api: {
    externalResolver: true,
  },
};

export default async function connectHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const requestUrl = req.url || "";

  try {
    return await handleConnect(req, res);
  } catch (error) {
    // Storyblok may call the callback URL without required query params during setup checks.
    // In that case, redirect to the error page instead of returning a 500.
    const isCallbackWithoutSpaceId =
      requestUrl.includes("/callback") && !requestUrl.includes("space_id=");

    if (isCallbackWithoutSpaceId && !res.headersSent) {
      res.redirect(302, "/401");
      return;
    }

    throw error;
  }
}
