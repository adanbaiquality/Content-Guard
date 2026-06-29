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
  media: {
    hasAudioLikeAd: boolean;
    hasWarningAudioHint: boolean;
  };
  mode: "image" | "none" | "text-full" | "text-short";
  sourceHints: {
    assetHost: string | null;
    hasOfficialAssetHint: boolean;
    sourceDescriptor: string | null;
  };
  style: {
    color: string | null;
    fontSizePx: number | null;
    fontWeight: number | null;
    isFixedLike: boolean;
  };
  warningText: {
    hasFullText: boolean;
    hasShortText: boolean;
  };
  warningGeometry: {
    centerOffsetRatioX: number | null;
    heightRatio: number | null;
    leftRatio: number | null;
    topRatio: number | null;
    widthRatio: number | null;
  };
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
        "Kredietwaarschuwing placement/size violates internet requirements (centered top, full width, minimum 10% height).",
      details: positioningIssues.slice(0, 5),
      severity: "error",
      type: "kredietwaarschuwing-position-size",
    });
  }

  // Check 3: Warning is visible in initial viewport
  const visibilityIssues = await checkAFMInitialViewportVisibility(page);
  if (visibilityIssues.length > 0) {
    violations.push({
      count: visibilityIssues.length,
      description:
        "Kredietwaarschuwing is not visible in the initial viewport.",
      details: visibilityIssues.slice(0, 5),
      severity: "error",
      type: "kredietwaarschuwing-visibility",
    });
  }

  // Check 4: Source hint (AFM-provided material)
  const sourceIssues = await checkAFMSourceHints(page);
  if (sourceIssues.length > 0) {
    violations.push({
      count: sourceIssues.length,
      description:
        "AFM kredietwaarschuwing source/material could not be verified as official downloadable material.",
      details: sourceIssues.slice(0, 5),
      severity: "error",
      type: "kredietwaarschuwing-source",
    });
  }

  // Check 5: Fallback text mode requirements (Art. 2:2 lid 6-7)
  const fallbackIssues = await checkAFMFallbackTextRules(page);
  if (fallbackIssues.length > 0) {
    violations.push({
      count: fallbackIssues.length,
      description:
        "Fallback warning text mode does not meet required styling/placement constraints for internet ads.",
      details: fallbackIssues.slice(0, 5),
      severity: "error",
      type: "kredietwaarschuwing-fallback",
    });
  }

  // Check 6: Audio warning requirement (Art. 2:2 lid 3)
  const audioIssues = await checkAFMAudioWarningRules(page);
  if (audioIssues.length > 0) {
    violations.push({
      count: audioIssues.length,
      description:
        "Audio ad detected without verifiable AFM warning audio hint (required directly after ad at same speed/volume).",
      details: audioIssues.slice(0, 5),
      severity: "error",
      type: "kredietwaarschuwing-audio",
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
        media: {
          hasAudioLikeAd: false,
          hasWarningAudioHint: false,
        },
        mode: "none" as const,
        sourceHints: {
          assetHost: null,
          hasOfficialAssetHint: false,
          sourceDescriptor: null,
        },
        style: {
          color: null,
          fontSizePx: null,
          fontWeight: null,
          isFixedLike: false,
        },
        warningGeometry: {
          centerOffsetRatioX: null,
          heightRatio: null,
          leftRatio: null,
          topRatio: null,
          widthRatio: null,
        },
        warningText: {
          hasFullText: false,
          hasShortText: false,
        },
      };
    }

    const fullTextRegex = /let\s*op!?\s*geld\s*lenen\s*kost\s*geld\.?/i;
    const shortTextRegex = /geld\s*lenen\s*kost\s*geld\.?/i;
    const keywordRegex = /kredietwaarschuwing|lenen\s*kost\s*geld|let\s*op|afm/i;
    const warningAudioRegex = /kredietwaarschuwing|let\s*op|geld\s*lenen\s*kost\s*geld/i;

    const hasFullText = fullTextRegex.test(body.textContent || "");
    const hasShortText = shortTextRegex.test(body.textContent || "");

    const findTextMatch = (regex: RegExp) => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();

      while (current) {
        const textNode = current as Text;
        const rawText = textNode.textContent ?? "";
        const text = rawText.trim();
        if (text.length > 0) {
          const match = rawText.match(regex);
          if (match && typeof match.index === "number") {
            const range = document.createRange();
            const start = Math.max(match.index, 0);
            const end = Math.min(start + match[0].length, rawText.length);
            range.setStart(textNode, start);
            range.setEnd(textNode, end);
            const rect = range.getBoundingClientRect();
            const element = textNode.parentElement;

            if (element && rect.width > 0 && rect.height > 0) {
              return {
                element,
                rect,
              };
            }
          }
        }

        current = walker.nextNode();
      }

      return null;
    };

    const fullTextMatch = findTextMatch(fullTextRegex);
    const shortTextMatch = findTextMatch(shortTextRegex);

    const imageLikeNodes = [...document.querySelectorAll<HTMLElement>("img, svg, picture, object")];
    let imageCandidate: HTMLElement | null = null;
    let sourceDescriptor: string | null = null;
    let assetHost: string | null = null;

    for (const el of imageLikeNodes) {
      const attrs = [
        el.getAttribute("src") ?? "",
        el.getAttribute("data") ?? "",
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
        sourceDescriptor = attrs;
        try {
          const srcValue =
            (el as HTMLImageElement).currentSrc ||
            (el as HTMLImageElement).src ||
            el.getAttribute("src") ||
            el.getAttribute("data") ||
            "";
          if (srcValue) {
            const url = new URL(srcValue, window.location.href);
            assetHost = url.host.toLowerCase();
          }
        } catch {
          assetHost = null;
        }
        break;
      }
    }

    const warningElement = imageCandidate ?? fullTextMatch?.element ?? shortTextMatch?.element ?? null;
    const mode = imageCandidate
      ? ("image" as const)
      : fullTextMatch
        ? ("text-full" as const)
        : shortTextMatch
          ? ("text-short" as const)
          : ("none" as const);

    const audioNodes = [
      ...document.querySelectorAll<HTMLAudioElement>("audio"),
      ...document.querySelectorAll<HTMLVideoElement>("video"),
    ];

    const hasAudioLikeAd = audioNodes.some((node) => {
      const src = (node.currentSrc || node.src || "").toLowerCase();
      const attrs = [
        src,
        node.getAttribute("aria-label") ?? "",
        node.getAttribute("title") ?? "",
        node.id ?? "",
        node.className ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return (
        node.autoplay ||
        src.length > 0 ||
        /ad|reclame|commercial|promo|krediet|loan/.test(attrs)
      );
    });

    const hasWarningAudioHint = audioNodes.some((node) => {
      const attrs = [
        node.currentSrc || node.src || "",
        node.getAttribute("aria-label") ?? "",
        node.getAttribute("title") ?? "",
        node.id ?? "",
        node.className ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return warningAudioRegex.test(attrs);
    });

    if (!warningElement) {
      return {
        details: [
          'No AFM kredietwaarschuwing element detected (expected warning "Let op! Geld lenen kost geld" and warning symbol).',
        ],
        hasWarning: false,
        media: {
          hasAudioLikeAd,
          hasWarningAudioHint,
        },
        mode,
        sourceHints: {
          assetHost,
          hasOfficialAssetHint: false,
          sourceDescriptor,
        },
        style: {
          color: null,
          fontSizePx: null,
          fontWeight: null,
          isFixedLike: false,
        },
        warningGeometry: {
          centerOffsetRatioX: null,
          heightRatio: null,
          leftRatio: null,
          topRatio: null,
          widthRatio: null,
        },
        warningText: {
          hasFullText,
          hasShortText,
        },
      };
    }

    const rect = imageCandidate
      ? imageCandidate.getBoundingClientRect()
      : fullTextMatch?.rect ?? shortTextMatch?.rect ?? warningElement.getBoundingClientRect();
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);

    const widthRatio = rect.width / viewportWidth;
    const heightRatio = rect.height / viewportHeight;
    const topRatio = rect.top / viewportHeight;
    const leftRatio = rect.left / viewportWidth;
    const elementCenterX = rect.left + rect.width / 2;
    const viewportCenterX = viewportWidth / 2;
    const centerOffsetRatioX = Math.abs(elementCenterX - viewportCenterX) / viewportWidth;

    const computed = window.getComputedStyle(warningElement);
    const fontSizeRaw = computed.fontSize || "";
    const parsedFontSize = Number.parseFloat(fontSizeRaw);
    const fontWeightRaw = computed.fontWeight || "";
    const parsedFontWeight = Number.parseInt(fontWeightRaw, 10);
    const normalizedFontWeight = Number.isNaN(parsedFontWeight)
      ? fontWeightRaw === "bold"
        ? 700
        : 400
      : parsedFontWeight;

    const srcText = sourceDescriptor ?? "";
    const hasOfficialAssetHint =
      /(^|\.)afm\.nl$/.test(assetHost ?? "") ||
      /afm\.nl\/kredietwaarschuwing/.test(srcText) ||
      /kredietwaarschuwing/.test(srcText);

    const isFixedLike = ["fixed", "sticky"].includes(computed.position);

    return {
      details: [
        `Detected warning candidate (${mode}) at top=${Math.round(rect.top)}px, left=${Math.round(rect.left)}px, width=${Math.round(rect.width)}px, height=${Math.round(rect.height)}px.`,
      ],
      hasWarning: true,
      media: {
        hasAudioLikeAd,
        hasWarningAudioHint,
      },
      mode,
      sourceHints: {
        assetHost,
        hasOfficialAssetHint,
        sourceDescriptor,
      },
      style: {
        color: computed.color || null,
        fontSizePx: Number.isFinite(parsedFontSize) ? parsedFontSize : null,
        fontWeight: Number.isFinite(normalizedFontWeight) ? normalizedFontWeight : null,
        isFixedLike,
      },
      warningGeometry: {
        centerOffsetRatioX,
        heightRatio,
        leftRatio,
        topRatio,
        widthRatio,
      },
      warningText: {
        hasFullText,
        hasShortText,
      },
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

    if (analysis.hasWarning && analysis.mode === "text-full" && !analysis.warningText.hasFullText) {
      issues.push('Full warning mode detected but exact tekst "Let op! Geld lenen kost geld" was not matched.');
    }

    if (analysis.hasWarning && analysis.mode === "text-short" && !analysis.warningText.hasShortText) {
      issues.push("Short warning text mode detected but expected shortened warning text pattern was not matched.");
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

    const { topRatio, widthRatio, heightRatio, centerOffsetRatioX } = analysis.warningGeometry;

    if (topRatio !== null && topRatio > 0.05) {
      issues.push(
        `Warning is not positioned at the top (top ratio: ${topRatio.toFixed(3)}; expected <= 0.05).`,
      );
    }

    if (centerOffsetRatioX !== null && centerOffsetRatioX > 0.02) {
      issues.push(
        `Warning is not horizontally centered (center offset ratio: ${centerOffsetRatioX.toFixed(3)}; expected <= 0.02).`,
      );
    }

    if (widthRatio !== null && widthRatio < 0.98) {
      issues.push(
        `Warning width is too small (width ratio: ${widthRatio.toFixed(3)}; expected >= 0.98 of ad/page width).`,
      );
    }

    if (heightRatio !== null && heightRatio < 0.10) {
      issues.push(
        `Warning height is below legal minimum (height ratio: ${heightRatio.toFixed(3)}; expected >= 0.10).`,
      );
    }

    if (analysis.mode !== "image" && analysis.style.fontSizePx !== null && analysis.style.fontSizePx < 9.33) {
      issues.push(
        `Warning text size appears below 7pt minimum (font-size: ${analysis.style.fontSizePx.toFixed(2)}px; expected >= 9.33px).`,
      );
    }
  } catch {
    issues.push("Unable to verify AFM warning positioning/size due to DOM evaluation error.");
  }
  return issues;
}

async function checkAFMInitialViewportVisibility(page: Page): Promise<string[]> {
  const issues: string[] = [];
  try {
    const analysis = await analyzeAFMWarning(page);
    if (!analysis.hasWarning) {
      return issues;
    }

    const { topRatio, heightRatio } = analysis.warningGeometry;
    const isVisible =
      topRatio !== null &&
      heightRatio !== null &&
      topRatio < 1 &&
      topRatio + heightRatio > 0;

    if (!isVisible) {
      issues.push(
        `Warning is not visible in the initial viewport (topRatio: ${topRatio?.toFixed(3) ?? "n/a"}, heightRatio: ${heightRatio?.toFixed(3) ?? "n/a"}).`,
      );
    }
  } catch {
    issues.push("Unable to verify AFM warning visibility in the initial viewport.");
  }
  return issues;
}

async function checkAFMSourceHints(page: Page): Promise<string[]> {
  const issues: string[] = [];
  try {
    const analysis = await analyzeAFMWarning(page);
    if (!analysis.hasWarning) {
      return issues;
    }

    if (analysis.mode === "image" && !analysis.sourceHints.hasOfficialAssetHint) {
      issues.push(
        "Image warning found, but source could not be verified as AFM official kredietwaarschuwing material.",
      );
    }

    if (analysis.mode !== "image" && !analysis.warningText.hasFullText && !analysis.warningText.hasShortText) {
      issues.push(
        "Text warning mode found, but neither full nor shortened legally expected warning text could be matched.",
      );
    }
  } catch {
    issues.push("Unable to evaluate AFM source hints for warning assets.");
  }
  return issues;
}

async function checkAFMFallbackTextRules(page: Page): Promise<string[]> {
  const issues: string[] = [];
  try {
    const analysis = await analyzeAFMWarning(page);
    if (!analysis.hasWarning) {
      return issues;
    }

    if (analysis.mode === "text-full") {
      if (!analysis.warningText.hasFullText) {
        issues.push("Fallback full-text mode is active but exact warning text is not present.");
      }

      const { topRatio, centerOffsetRatioX, widthRatio, heightRatio } = analysis.warningGeometry;
      if (topRatio !== null && topRatio > 0.05) {
        issues.push("Fallback full-text warning is not placed at the top.");
      }
      if (centerOffsetRatioX !== null && centerOffsetRatioX > 0.02) {
        issues.push("Fallback full-text warning is not centered.");
      }
      if (widthRatio !== null && widthRatio < 0.98) {
        issues.push("Fallback full-text warning is not full width.");
      }
      if (heightRatio !== null && heightRatio < 0.10) {
        issues.push("Fallback full-text warning does not meet minimum 10% height.");
      }
    }

    if (analysis.mode === "text-short") {
      if (!analysis.warningText.hasShortText) {
        issues.push("Shortened warning mode is active but shortened warning text was not detected.");
      }

      const { topRatio, centerOffsetRatioX } = analysis.warningGeometry;
      if (topRatio !== null && topRatio < 0.80) {
        issues.push("Shortened warning text should be shown at the bottom of the ad/page.");
      }

      if (centerOffsetRatioX !== null && centerOffsetRatioX > 0.02) {
        issues.push("Shortened warning text is not centered.");
      }

      const color = (analysis.style.color ?? "").toLowerCase();
      const isRed = /rgb\(255,\s*0,\s*0\)|#f00|#ff0000|red/.test(color);
      const isBlack = /rgb\(0,\s*0,\s*0\)|#000|#000000|black/.test(color);
      if (!(isRed || isBlack)) {
        issues.push("Shortened warning text color should be black or red.");
      }

      if ((analysis.style.fontWeight ?? 400) < 600) {
        issues.push("Shortened warning text should be bold if possible.");
      }
    }
  } catch {
    issues.push("Unable to verify fallback text mode rules.");
  }

  return issues;
}

async function checkAFMAudioWarningRules(page: Page): Promise<string[]> {
  const issues: string[] = [];
  try {
    const analysis = await analyzeAFMWarning(page);
    if (!analysis.media.hasAudioLikeAd) {
      return issues;
    }

    if (!analysis.media.hasWarningAudioHint) {
      issues.push(
        "Audio-capable ad media detected but no warning audio asset hint (e.g., kredietwaarschuwing audio) was found.",
      );
    }
  } catch {
    issues.push("Unable to verify AFM audio warning requirements.");
  }

  return issues;
}
