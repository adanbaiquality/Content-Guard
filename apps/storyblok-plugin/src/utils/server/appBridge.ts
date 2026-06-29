import jwt, { type VerifyCallback } from "jsonwebtoken";
import type { NextApiRequest } from "next";

import type { AppBridgeSession, VerifyResponse } from "@/types";

import { APP_BRIDGE_TOKEN_HEADER_KEY } from "../const";

export const verifyAppBridgeHeader = async (req: NextApiRequest) => {
  const token = req.headers[APP_BRIDGE_TOKEN_HEADER_KEY];
  const result = await verifyAppBridgeToken(token as string);
  return result;
};

export const verifyAppBridgeToken = async (token: string): Promise<VerifyResponse> => {
  try {
    return {
      ok: true,
      result: await verifyToken(token, process.env.CLIENT_SECRET || ""),
    };
  } catch (error) {
    return { error, ok: false };
  }
};

async function verifyToken(token: string, secret: string): Promise<AppBridgeSession> {
  return new Promise((resolve, reject) => {
    const verifyCallback: VerifyCallback = (err, decoded) =>
      err ? reject(err) : resolve(decoded as AppBridgeSession);
    jwt.verify(token, secret, verifyCallback);
  });
}
