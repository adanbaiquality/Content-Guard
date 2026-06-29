import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "playwright";
import {
  type AuditResult,
  type StoryblokWorkflowWebhookPayload,
  isValidPreviewUrl,
  resolvePreviewUrl,
} from "../server/audits/index.ts";

const validatePreviewUrl = (previewUrl: string | undefined): AuditResult | null => {
  if (!previewUrl) {
    return {
      audit: "preview-a11y-axe",
      message: "Missing preview URL in webhook payload.",
      meta: {
        expectedFields: [
          "preview_url",
          "previewUrl",
          "preview.url",
          "urls.preview",
          "story.preview_url",
          "story.previewUrl",
        ],
      },
      passed: false,
    };
  }

  if (!isValidPreviewUrl(previewUrl)) {
    return {
      audit: "preview-a11y-axe",
      message: "Preview URL is invalid (expected http/https URL).",
      meta: {
        previewUrl,
      },
      passed: false,
    };
  }

  return null;
};

const processViolations = (violations: any[]): Record<string, any> => ({
  inapplicableCount: 0,
  incompleteCount: 0,
  passesCount: 0,
  violations,
  violationsCount: violations.length,
});

export const runPreviewA11yAxeAudit = async (
  payload: StoryblokWorkflowWebhookPayload,
): Promise<AuditResult> => {
  "use step";

  const previewUrl = resolvePreviewUrl(payload);
  const validationError = validatePreviewUrl(previewUrl);

  if (validationError) {
    return validationError;
  }

  const safePreviewUrl = previewUrl!;

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(safePreviewUrl, {
      timeout: 45_000,
      waitUntil: "networkidle",
    });

    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const violations = axeResults.violations.map((violation: any) => ({
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
      tags: violation.tags,
    }));

    const passed = violations.length === 0;

    await context.close();

    return {
      audit: "preview-a11y-axe",
      message: passed
        ? "No axe accessibility violations detected on preview page."
        : `Found ${violations.length} accessibility violation(s) on preview page.`,
      meta: {
        inapplicableCount: axeResults.inapplicable.length,
        incompleteCount: axeResults.incomplete.length,
        passesCount: axeResults.passes.length,
        previewUrl,
        violations,
        violationsCount: violations.length,
      },
      passed,
    };
  } catch (error) {
    return {
      audit: "preview-a11y-axe",
      message: "Failed to run Playwright + axe audit on preview URL.",
      meta: {
        error: error instanceof Error ? error.message : String(error),
        previewUrl: safePreviewUrl,
      },
      passed: false,
    };
  } finally {
    await browser?.close();
  }
};
