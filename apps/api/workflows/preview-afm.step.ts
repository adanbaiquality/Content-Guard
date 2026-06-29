import { type Page, chromium } from "playwright";
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

interface AFMWarningAnalysis {
  details: string[];
  hasWarning: boolean;
  hasWarningText: boolean;
  heightRatio: number | null;
  topPositionRatio: number | null;
  warningKind: "image" | "none" | "text";
  widthRatio: number | null;
}

export async function runPreviewAFMAudit(
  payload: StoryblokWorkflowWebhookPayload,
): Promise<AuditResult> {
  "use step";

  const previewUrl = resolvePreviewUrl(payload)

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

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    browser = await chromium.launch({ headless: true });
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
    await browser?.close();
  }
}

async function performAFMChecks(page: Page): Promise<AFMViolation[]> {
  const violations: AFMViolation[] = [];

  // Check 1: Presence and wording of AFM kredietwaarschuwing
  const warningPresenceIssues = await checkAFMWarningPresence(page);
  if (warningPresenceIssues.length > 0) {
    violations.push({
      count: warningPresenceIssues.length,
      description:
        'Required kredietwaarschuwing is missing or cannot be verified (expected: "Let op! Geld lenen kost geld" with AFM warning symbol).',
      details: warningPresenceIssues.slice(0, 5),
      severity: "error",
      type: "missing-kredietwaarschuwing",
    });
  }

  // Check 2: Positioning and size for website use (Art. 2:2 Nrgfo)
  const positioningIssues = await checkAFMPositioningAndSize(page);
  if (positioningIssues.length > 0) {
    violations.push({
      count: positioningIssues.length,
      description:
        "Kredietwaarschuwing placement/size deviates from AFM guidance for internet ads (centered top, full width, ~10% height).",
      details: positioningIssues.slice(0, 5),
      severity: "error",
      type: "kredietwaarschuwing-position-size",
    });
  }

  // Check 3: Warning remains visible on page (always visible requirement)
  const visibilityIssues = await checkAFMVisibilityOnScroll(page);
  if (visibilityIssues.length > 0) {
    violations.push({
      count: visibilityIssues.length,
      description:
        "Kredietwaarschuwing may not remain visible during browsing (AFM requires warning on each web page containing the ad).",
      details: visibilityIssues.slice(0, 5),
      severity: "warning",
      type: "kredietwaarschuwing-visibility",
    });
  }

  // Check 4: Source hint (AFM-provided material)
  const sourceIssues = await checkAFMSourceHints(page);
  if (sourceIssues.length > 0) {
    violations.push({
      count: sourceIssues.length,
      description:
        "Could not identify clear AFM kredietwaarschuwing source/material hints. Manual review recommended.",
      details: sourceIssues.slice(0, 5),
      severity: "warning",
      type: "kredietwaarschuwing-source",
    });
  }

  return violations;
}

async function analyzeAFMWarning(page: Page): Promise<AFMWarningAnalysis> {
  return page.evaluate(() => {
    const { body } = document;
    if (!body) {
      return {
        details: ["No <body> element found for AFM warning analysis."],
        hasWarning: false,
        hasWarningText: false,
        heightRatio: null,
        topPositionRatio: null,
        warningKind: "none" as const,
        widthRatio: null,
      };
    }

    const warningTextRegex = /let\s*op!?\s*geld\s*lenen\s*kost\s*geld/i;
    const keywordRegex = /kredietwaarschuwing|lenen\s*kost\s*geld|let\s*op/i;

    const textNodes = [
      ...document.querySelectorAll<HTMLElement>("p, span, div, strong, em, h1, h2, h3, h4, h5, h6"),
    ];

    let textCandidate: HTMLElement | null = null;
    for (const el of textNodes) {
      const text = (el.textContent ?? "").trim();
      if (text.length === 0) {
        continue;
      }
      if (warningTextRegex.test(text)) {
        textCandidate = el;
        break;
      }
    }

    const imageLikeNodes = [...document.querySelectorAll<HTMLElement>("img, svg, picture")];
    let imageCandidate: HTMLElement | null = null;

    for (const el of imageLikeNodes) {
      const attrs = [
        el.getAttribute("src") ?? "",
        el.getAttribute("alt") ?? "",
        el.getAttribute("title") ?? "",
        el.getAttribute("aria-label") ?? "",
        el.id ?? "",
        el.className ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (keywordRegex.test(attrs)) {
        imageCandidate = el;
        break;
      }
    }

    const warningElement = textCandidate ?? imageCandidate;
    const hasWarningText = warningTextRegex.test(body.textContent || "");

    if (!warningElement) {
      return {
        details: [
          'No AFM kredietwaarschuwing element detected (expected warning "Let op! Geld lenen kost geld" and warning symbol).',
        ],
        hasWarning: false,
        hasWarningText,
        heightRatio: null,
        topPositionRatio: null,
        warningKind: "none" as const,
        widthRatio: null,
      };
    }

    warningElement.setAttribute("data-afm-audit-target", "true");

    const rect = warningElement.getBoundingClientRect();
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);

    const widthRatio = rect.width / viewportWidth;
    const heightRatio = rect.height / viewportHeight;
    const topPositionRatio = rect.top / viewportHeight;

    return {
      details: [
        `Detected warning candidate (${textCandidate ? "text" : "image"}) at top=${Math.round(rect.top)}px, width=${Math.round(rect.width)}px, height=${Math.round(rect.height)}px.`,
      ],
      hasWarning: true,
      hasWarningText,
      heightRatio,
      topPositionRatio,
      warningKind: textCandidate ? ("text" as const) : ("image" as const),
      widthRatio,
    };
  });
}

async function checkAFMWarningPresence(page: Page): Promise<string[]> {
  const issues: string[] = [];
  try {
    const analysis = await analyzeAFMWarning(page);

    if (!analysis.hasWarning) {
      issues.push(...analysis.details);
    }

    if (analysis.hasWarning && !analysis.hasWarningText) {
      issues.push(
        'Exact waarschuwingstekst "Let op! Geld lenen kost geld" not found as selectable text. If warning is image-only this may still be valid, but should be manually verified against AFM material.',
      );
    }
  } catch {
    issues.push("Unable to verify AFM warning presence due to DOM evaluation error.");
  }
  return issues;
}

async function checkAFMPositioningAndSize(page: Page): Promise<string[]> {
  const issues: string[] = [];
  try {
    const analysis = await analyzeAFMWarning(page);
    if (!analysis.hasWarning) {
      return issues;
    }

    if (analysis.topPositionRatio !== null && analysis.topPositionRatio > 0.25) {
      issues.push(
        `Warning appears too low on page (top position ratio: ${analysis.topPositionRatio.toFixed(2)}; expected near top for internet ads).`,
      );
    }

    if (analysis.widthRatio !== null && analysis.widthRatio < 0.85) {
      issues.push(
        `Warning width appears too small (width ratio: ${analysis.widthRatio.toFixed(2)}; expected approximately full width).`,
      );
    }

    if (analysis.heightRatio !== null && analysis.heightRatio < 0.08) {
      issues.push(
        `Warning height appears below expected prominence (height ratio: ${analysis.heightRatio.toFixed(2)}; AFM guidance targets at least 10% of ad height).`,
      );
    }
  } catch {
    issues.push("Unable to verify AFM warning positioning/size due to DOM evaluation error.");
  }
  return issues;
}

async function checkAFMVisibilityOnScroll(page: Page): Promise<string[]> {
  const issues: string[] = [];
  try {
    await analyzeAFMWarning(page);

    const before = await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>("[data-afm-audit-target='true']");
      if (!target) {
        return { found: false, inViewport: false };
      }

      const rect = target.getBoundingClientRect();
      const inViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
      return { found: true, inViewport };
    });

    if (!before.found) {
      return issues;
    }

    await page.evaluate(() => {
      window.scrollTo({ behavior: "instant", top: Math.max(document.body.scrollHeight * 0.6, 1) });
    });

    const after = await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>("[data-afm-audit-target='true']");
      if (!target) {
        return { inViewport: false };
      }
      const rect = target.getBoundingClientRect();
      return { inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight };
    });

    await page.evaluate(() => {
      window.scrollTo({ behavior: "instant", top: 0 });
      const target = document.querySelector<HTMLElement>("[data-afm-audit-target='true']");
      target?.removeAttribute("data-afm-audit-target");
    });

    if (!after.inViewport) {
      issues.push(
        "Detected warning is not continuously visible after scrolling. Review whether warning remains visible where required.",
      );
    }
  } catch {
    issues.push("Unable to verify AFM warning visibility during scrolling.");
  }
  return issues;
}

async function checkAFMSourceHints(page: Page): Promise<string[]> {
  const issues: string[] = [];
  try {
    const sourceHints = await page.evaluate(() => {
      const hints: string[] = [];
      const images = [...document.querySelectorAll<HTMLImageElement>("img")];

      const matching = images.filter((img) => {
        const attrs = [img.src, img.alt, img.title, img.className, img.id].join(" ").toLowerCase();
        return /afm|kredietwaarschuwing|lenen\s*kost\s*geld/.test(attrs);
      });

      if (matching.length === 0) {
        hints.push(
          "No image source/metadata hint found for AFM kredietwaarschuwing assets (afm/kredietwaarschuwing/lenen-kost-geld).",
        );
      }

      const hasDirectText = /let\s*op!?\s*geld\s*lenen\s*kost\s*geld/i.test(
        document.body?.textContent ?? "",
      );
      if (!hasDirectText && matching.length === 0) {
        hints.push("Could not detect either exact warning text or clear AFM image asset hint.");
      }

      return hints;
    });
    issues.push(...sourceHints);
  } catch {
    issues.push("Unable to evaluate AFM source hints for warning assets.");
  }
  return issues;
}
