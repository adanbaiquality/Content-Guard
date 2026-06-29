export * from "./appBridge";

export type AuditCategory = "a11y" | "afm" | "brand";
export type AuditSeverity = "critical" | "serious" | "moderate" | "minor";

export type AuditResult = {
  audit: string;
  passed: boolean;
  message: string;
  category: AuditCategory;
  severity: AuditSeverity;
  /** Current content that violates the rule */
  current?: string;
  /** Suggested replacement content */
  suggestion?: string;
  /** Rule reference, e.g. "WCAG 2.4.4" */
  ruleId?: string;
  /** Optional URL to the exact rule or document section */
  ruleUrl?: string;
  meta?: Record<string, unknown>;
};
