import type { NextApiRequest, NextApiResponse } from "next";

import { initOauthFlowUrl } from "@/auth";
import { getAppSession } from "@/utils/server";

const HTTP_STATUS_OK = 200;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { initOAuth } = JSON.parse(req.body);
  if (initOAuth) {
    return res.status(HTTP_STATUS_OK).json({
      ok: false,
      redirectTo: initOauthFlowUrl,
    });
  }

  const appSession = await getAppSession(req, res);
  if (appSession) {
    return res.status(HTTP_STATUS_OK).json({
      ok: true,
    });
  }

  return res.status(HTTP_STATUS_OK).json({
    ok: false,
    redirectTo: initOauthFlowUrl,
  });
}
