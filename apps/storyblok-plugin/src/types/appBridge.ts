export interface AppBridgeConfig {
  enabled: boolean;
  oauth: boolean;
  origin?: string;
}

export type VerifyResponse = { ok: true; result: AppBridgeSession } | { ok: false; error: unknown };

export interface AppBridgeSession {
  app_id: number;
  space_id: number;
  user_id: number;
  iat: number;
  exp: number;
}

export type PluginType = "space-plugin" | "tool-plugin";

export interface UseAppBridgeParams {
  type: PluginType;
}

export interface UseAppBridgeMessagesParams {
  type: PluginType;
}

export type PostMessageAction = "tool-changed" | "app-changed";

export interface ValidateMessagePayload {
  action: PostMessageAction;
  event: "validate";
  tool?: string | null;
}

export interface BeginOAuthMessagePayload {
  action: PostMessageAction;
  event: "beginOAuth";
  tool?: string | null;
  redirectTo: string;
}

export type CreateValidateMessagePayload = (params: {
  type: PluginType;
  slug: string | null;
}) => ValidateMessagePayload;

export type CreateBeginOAuthMessagePayload = (params: {
  type: PluginType;
  slug: string | null;
  redirectTo: string;
}) => BeginOAuthMessagePayload;
