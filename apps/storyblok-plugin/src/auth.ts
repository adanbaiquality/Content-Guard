import type { AuthHandlerParams } from "@storyblok/app-extension-auth";
import { authHandler, getSessionStore } from "@storyblok/app-extension-auth";
["CLIENT_ID", "CLIENT_SECRET", "BASE_URL"].forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Environment variable "${key}" is missing.`);
  }
});

export const sessionKey = "auth";

export const authParams: AuthHandlerParams = {
  baseUrl: process.env.BASE_URL!,
  clientId: process.env.CLIENT_ID!,
  clientSecret: process.env.CLIENT_SECRET!,
  endpointPrefix: "/api/connect",
  errorCallback: "/401",
  sessionKey,
  successCallback: "/",
};

export const initOauthFlowUrl = `${authParams.endpointPrefix}/storyblok`;

export const appSessionCookies = getSessionStore(authParams);
export const handleConnect = authHandler(authParams);
