import { chromium } from "playwright";
import {
  type AuditResult,
  type StoryblokWorkflowWebhookPayload,
  isValidPreviewUrl,
  resolvePreviewUrl,
} from "../server/audits/index.ts";

interface AFMViolation {
  type: string;
  severity: "error" | "warning";
  description: string;
  count: number;
  details?: string[];
}

export async function runPreviewAFMAudit(
  payload: StoryblokWorkflowWebhookPayload,
): Promise<AuditResult> {
  "use step";

  const previewUrl = resolvePreviewUrl(payload);

  if (!previewUrl) {
    return {
      audit: "preview-afm",
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
      audit: "preview-afm",
      message: "Preview URL is invalid (expected http/https URL).",
      meta: {
        previewUrl,
      },
      passed: false,
    };
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(previewUrl, {
      timeout: 45_000,
      waitUntil: "networkidle",
    });

    // Run AFM compliance checks
    const afmViolations = await performAFMChecks(page);

    const passed = afmViolations.length === 0;

    await context.close();

    return {
      audit: "preview-afm",
      message: passed
        ? "Page is AFM compliant."
        : `Found ${afmViolations.length} AFM compliance violation(s).`,
      meta: {
        previewUrl,
        violations: afmViolations,
        violationsCount: afmViolations.length,
      },
      passed,
    };
  } catch (error) {
    return {
      audit: "preview-afm",
      message: "Failed to run AFM compliance audit on preview URL.",
      meta: {
        error: error instanceof Error ? error.message : String(error),
        previewUrl,
      },
      passed: false,
    };
  } finally {
    await browser.close();
  }
}

async function performAFMChecks(page: any): Promise<AFMViolation[]> {
  const violations: AFMViolation[] = [];

  // Check 1: Color Contrast
  const contrastIssues = await checkColorContrast(page);
  if (contrastIssues.length > 0) {
    violations.push({
      count: contrastIssues.length,
      description: "Text does not meet minimum color contrast ratio (4.5:1 for normal text).",
      details: contrastIssues.slice(0, 5),
      severity: "error",
      type: "color-contrast",
    });
  }

  // Check 2: Image Alt Text
  const missingAltText = await checkImageAltText(page);
  if (missingAltText.length > 0) {
    violations.push({
      count: missingAltText.length,
      description: "Images are missing alternative text.",
      details: missingAltText.slice(0, 5),
      severity: "error",
      type: "missing-alt-text",
    });
  }

  // Check 3: Form Labels
  const missingLabels = await checkFormLabels(page);
  if (missingLabels.length > 0) {
    violations.push({
      count: missingLabels.length,
      description: "Form inputs are missing associated labels.",
      details: missingLabels.slice(0, 5),
      severity: "error",
      type: "missing-form-labels",
    });
  }

  // Check 4: Heading Structure
  const headingIssues = await checkHeadingStructure(page);
  if (headingIssues.length > 0) {
    violations.push({
      count: headingIssues.length,
      description: "Heading hierarchy is not sequential.",
      details: headingIssues,
      severity: "warning",
      type: "heading-structure",
    });
  }

  // Check 5: Keyboard Navigation
  const keyboardIssues = await checkKeyboardNavigation(page);
  if (keyboardIssues.length > 0) {
    violations.push({
      count: keyboardIssues.length,
      description: "Interactive elements may not be keyboard accessible.",
      details: keyboardIssues.slice(0, 5),
      severity: "warning",
      type: "keyboard-navigation",
    });
  }

  return violations;
}

async function checkColorContrast(page: any): Promise<string[]> {
  const issues: string[] = [];
  try {
    const contrastResults = await page.evaluate(() => {
      const textElements = document.querySelectorAll("p, span, a, button, label, li");
      const violations: string[] = [];

      textElements.forEach((el: any, index: number) => {
        if (index > 20) {
          return;
        } // Limit checks
        const style = window.getComputedStyle(el);
        const bgColor = style.backgroundColor;
        const { color } = style;

        // Simple heuristic check - in production, use a proper contrast calculator
        if (bgColor === "rgba(0, 0, 0, 0)" || bgColor === "transparent") {
          return;
        }

        // Mark potential low contrast elements for manual review
        if ((color.includes("128") || color.includes("200")) && bgColor.includes("255")) {
          violations.push(`Element at index ${index}: potential low contrast`);
        }
      });

      return violations;
    });
    issues.push(...contrastResults);
  } catch {
    // Continue with other checks
  }
  return issues;
}

async function checkImageAltText(page: any): Promise<string[]> {
  const issues: string[] = [];
  try {
    const missingAlt = await page.evaluate(() => {
      const images = document.querySelectorAll("img");
      const violations: string[] = [];

      images.forEach((img: any, index: number) => {
        if (!img.alt || img.alt.trim() === "") {
          const src = img.src || "unknown";
          violations.push(
            `Image at index ${index} (src: ${src.substring(0, 50)}) missing alt text`,
          );
        }
      });

      return violations;
    });
    issues.push(...missingAlt);
  } catch {
    // Continue with other checks
  }
  return issues;
}

async function checkFormLabels(page: any): Promise<string[]> {
  const issues: string[] = [];
  try {
    const missingLabels = await page.evaluate(() => {
      const inputs = document.querySelectorAll("input, textarea, select");
      const violations: string[] = [];

      inputs.forEach((input: any, index: number) => {
        const { id } = input;
        const ariaLabel = input.getAttribute("aria-label");
        const ariaLabelledBy = input.getAttribute("aria-labelledby");

        if (!ariaLabel && !ariaLabelledBy) {
          if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (!label) {
              violations.push(
                `${input.tagName} at index ${index} (id: ${id}) has no associated label`,
              );
            }
          } else {
            violations.push(
              `${input.tagName} at index ${index} has no label, aria-label, or aria-labelledby`,
            );
          }
        }
      });

      return violations;
    });
    issues.push(...missingLabels);
  } catch {
    // Continue with other checks
  }
  return issues;
}

async function checkHeadingStructure(page: any): Promise<string[]> {
  const issues: string[] = [];
  try {
    const headingIssues = await page.evaluate(() => {
      const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];
      const violations: string[] = [];

      let lastLevel = 0;
      headings.forEach((heading: any) => {
        const level = parseInt(heading.tagName[1]);
        if (lastLevel > 0 && level > lastLevel + 1) {
          violations.push(
            `Heading hierarchy skip: ${heading.tagName} after h${lastLevel}. Text: "${heading.textContent?.substring(0, 50)}"`,
          );
        }
        lastLevel = level;
      });

      return violations;
    });
    issues.push(...headingIssues);
  } catch {
    // Continue with other checks
  }
  return issues;
}

async function checkKeyboardNavigation(page: any): Promise<string[]> {
  const issues: string[] = [];
  try {
    const keyboardIssues = await page.evaluate(() => {
      const violations: string[] = [];
      const interactiveElements = document.querySelectorAll(
        "button, a, input, select, textarea, [role='button']",
      );

      interactiveElements.forEach((el: any, index: number) => {
        if (index > 15) {
          return;
        } // Limit checks

        const tabindex = el.getAttribute("tabindex");
        const isNaturallyFocusable = ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(
          el.tagName,
        );

        if (!isNaturallyFocusable) {
          if (!tabindex || tabindex < 0) {
            violations.push(
              `${el.tagName} at index ${index} with role="button" may not be keyboard accessible (no positive tabindex)`,
            );
          }
        }
      });

      return violations;
    });
    issues.push(...keyboardIssues);
  } catch {
    // Continue with other checks
  }
  return issues;
}
