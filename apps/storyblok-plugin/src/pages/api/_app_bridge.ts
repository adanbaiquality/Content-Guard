import type { NextApiRequest, NextApiResponse } from "next";

import { verifyAppBridgeToken } from "@/utils/server";

const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_OK = 200;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res
      .status(HTTP_STATUS_METHOD_NOT_ALLOWED)
      .json({ error: "Method Not Allowed", ok: false });
  }

  const { token } = JSON.parse(req.body);
  const result = await verifyAppBridgeToken(token);
  return res.status(HTTP_STATUS_OK).json(result);
}
