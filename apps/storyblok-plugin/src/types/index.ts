export * from "./appBridge";

export type AuditResult = {
	audit: string;
	passed: boolean;
	message: string;
	meta?: Record<string, unknown>;
};
