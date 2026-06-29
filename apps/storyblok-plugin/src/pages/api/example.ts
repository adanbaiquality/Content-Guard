import type { NextApiRequest, NextApiResponse } from "next";

import { verifyAppBridgeHeader } from "@/utils/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const verified = await verifyAppBridgeHeader(req);

  if (verified.ok) {
    // Perform something with verified app bridge session
    /*
      Verified.result = {
        app_id: number;
        space_id: number;
        user_id: number;
        iat: number;
        exp: number;
      }
    */
  }

  return res.status(200).json({
    verified: verified.ok,
  });
}
