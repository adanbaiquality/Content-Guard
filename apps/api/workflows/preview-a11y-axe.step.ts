import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "playwright";
import {
  isValidPreviewUrl,
  resolvePreviewUrl,
  type AuditResult,
  type StoryblokWorkflowWebhookPayload,
} from "../server/audits/index.ts";

export async function runPreviewA11yAxeAudit(
  payload: StoryblokWorkflowWebhookPayload,
): Promise<AuditResult> {
  "use step";

  const previewUrl = resolvePreviewUrl(payload);

  if (!previewUrl) {
    return {
      audit: "preview-a11y-axe",
      passed: false,
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
    };
  }

  if (!isValidPreviewUrl(previewUrl)) {
    return {
      audit: "preview-a11y-axe",
      passed: false,
      message: "Preview URL is invalid (expected http/https URL).",
      meta: {
        previewUrl,
      },
    };
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(previewUrl, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });

    const axeResults = await new AxeBuilder({ page }).analyze();

    const violations = axeResults.violations.map((violation: any) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      tags: violation.tags,
      nodes: violation.nodes.length,
    }));

    const passed = violations.length === 0;

    await context.close();

    return {
      audit: "preview-a11y-axe",
      passed,
      message: passed
        ? "No axe accessibility violations detected on preview page."
        : `Found ${violations.length} accessibility violation(s) on preview page.`,
      meta: {
        previewUrl,
        violationsCount: violations.length,
        violations,
        passesCount: axeResults.passes.length,
        incompleteCount: axeResults.incomplete.length,
        inapplicableCount: axeResults.inapplicable.length,
      },
    };
  } catch (error) {
    return {
      audit: "preview-a11y-axe",
      passed: false,
      message: "Failed to run Playwright + axe audit on preview URL.",
      meta: {
        previewUrl,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    await browser.close();
  }
}
