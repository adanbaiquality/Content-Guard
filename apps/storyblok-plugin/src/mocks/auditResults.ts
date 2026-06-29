import { type AuditResult } from "@/types";

const AFM_LEIDRAAD_HYPO_2026_URL =
  "https://www.afm.nl/~/profmedia/files/wet-regelgeving/beleidsuitingen/leidraden/leidraad-hypotheekadvisering-herzien-2026.pdf";
const WCAG22_QUICKREF_URL = "https://www.w3.org/WAI/WCAG22/quickref/";

const WCAG22_QUICKREF_ITEMS: Array<[id: string, title: string, anchor: string]> = [
  ["1.1.1", "Non-text Content", "text-equiv-all"],
  ["1.2.1", "Audio-only and Video-only (Prerecorded)", "media-equiv-av-only-alt"],
  ["1.2.2", "Captions (Prerecorded)", "media-equiv-captions"],
  ["1.2.3", "Audio Description or Media Alternative (Prerecorded)", "media-equiv-audio-desc"],
  ["1.2.4", "Captions (Live)", "media-equiv-real-time-captions"],
  ["1.2.5", "Audio Description (Prerecorded)", "media-equiv-audio-desc-only"],
  ["1.2.6", "Sign Language (Prerecorded)", "media-equiv-sign"],
  ["1.2.7", "Extended Audio Description (Prerecorded)", "media-equiv-extended-ad"],
  ["1.2.8", "Media Alternative (Prerecorded)", "media-equiv-text-doc"],
  ["1.2.9", "Audio-only (Live)", "media-equiv-live-audio-only"],
  ["1.3.1", "Info and Relationships", "content-structure-separation-programmatic"],
  ["1.3.2", "Meaningful Sequence", "content-structure-separation-sequence"],
  ["1.3.3", "Sensory Characteristics", "content-structure-separation-understanding"],
  ["1.3.4", "Orientation", "orientation"],
  ["1.3.5", "Identify Input Purpose", "identify-input-purpose"],
  ["1.3.6", "Identify Purpose", "identify-purpose"],
  ["1.4.1", "Use of Color", "visual-audio-contrast-without-color"],
  ["1.4.2", "Audio Control", "visual-audio-contrast-dis-audio"],
  ["1.4.3", "Contrast (Minimum)", "visual-audio-contrast-contrast"],
  ["1.4.4", "Resize Text", "visual-audio-contrast-scale"],
  ["1.4.5", "Images of Text", "visual-audio-contrast-text-presentation"],
  ["1.4.6", "Contrast (Enhanced)", "visual-audio-contrast7"],
  ["1.4.7", "Low or No Background Audio", "visual-audio-contrast-noaudio"],
  ["1.4.8", "Visual Presentation", "visual-audio-contrast-visual-presentation"],
  ["1.4.9", "Images of Text (No Exception)", "visual-audio-contrast-text-images"],
  ["2.1.1", "Keyboard", "keyboard-operation-keyboard-operable"],
  ["2.1.2", "No Keyboard Trap", "keyboard-operation-trapping"],
  ["2.1.3", "Keyboard (No Exception)", "keyboard-operation-all-funcs"],
  ["2.1.4", "Character Key Shortcuts", "character-key-shortcuts"],
  ["2.2.1", "Timing Adjustable", "time-limits-required-behaviors"],
  ["2.2.2", "Pause, Stop, Hide", "time-limits-pause"],
  ["2.2.3", "No Timing", "time-limits-no-exceptions"],
  ["2.2.4", "Interruptions", "time-limits-postponed"],
  ["2.2.5", "Re-authenticating", "time-limits-server-timeout"],
  ["2.2.6", "Timeouts", "timeouts"],
  ["2.3.1", "Three Flashes or Below Threshold", "seizure-does-not-violate"],
  ["2.3.2", "Three Flashes", "seizure-three-times"],
  ["2.3.3", "Animation from Interactions", "animation-from-interactions"],
  ["2.4.1", "Bypass Blocks", "navigation-mechanisms-skip"],
  ["2.4.2", "Page Titled", "navigation-mechanisms-title"],
  ["2.4.3", "Focus Order", "navigation-mechanisms-focus-order"],
  ["2.4.4", "Link Purpose (In Context)", "navigation-mechanisms-refs"],
  ["2.4.5", "Multiple Ways", "navigation-mechanisms-mult-loc"],
  ["2.4.6", "Headings and Labels", "navigation-mechanisms-descriptive"],
  ["2.4.7", "Focus Visible", "navigation-mechanisms-focus-visible"],
  ["2.4.8", "Location", "navigation-mechanisms-location"],
  ["2.4.9", "Link Purpose (Link Only)", "navigation-mechanisms-link"],
  ["2.5.1", "Pointer Gestures", "pointer-gestures"],
  ["2.5.2", "Pointer Cancellation", "pointer-cancellation"],
  ["2.5.3", "Label in Name", "label-in-name"],
  ["2.5.4", "Motion Actuation", "motion-actuation"],
  ["2.5.5", "Target Size (Enhanced)", "target-size-enhanced"],
  ["2.5.6", "Concurrent Input Mechanisms", "concurrent-input-mechanisms"],
  ["2.5.7", "Dragging Movements", "dragging-movements"],
  ["2.5.8", "Target Size (Minimum)", "target-size-minimum"],
  ["3.1.1", "Language of Page", "meaning-doc-lang-id"],
  ["3.1.2", "Language of Parts", "meaning-other-lang-id"],
  ["3.1.3", "Unusual Words", "meaning-idioms"],
  ["3.1.4", "Abbreviations", "meaning-located"],
  ["3.1.5", "Reading Level", "meaning-supplements"],
  ["3.1.6", "Pronunciation", "meaning-pronunciation"],
  ["3.2.1", "On Focus", "consistent-behavior-receive-focus"],
  ["3.2.2", "On Input", "consistent-behavior-unpredictable-change"],
  ["3.2.3", "Consistent Navigation", "consistent-behavior-consistent-locations"],
  ["3.2.4", "Consistent Identification", "consistent-behavior-consistent-functionality"],
  ["3.2.5", "Change on Request", "consistent-behavior-no-extreme-changes-context"],
  ["3.2.6", "Consistent Help", "consistent-help"],
  ["3.3.1", "Error Identification", "minimize-error-identified"],
  ["3.3.2", "Labels or Instructions", "minimize-error-cues"],
  ["3.3.3", "Error Suggestion", "minimize-error-suggestions"],
  ["3.3.4", "Error Prevention (Legal, Financial, Data)", "minimize-error-reversible"],
  ["3.3.5", "Help", "minimize-error-context-help"],
  ["3.3.6", "Error Prevention (All)", "minimize-error-reversible-all"],
  ["3.3.7", "Redundant Entry", "redundant-entry"],
  ["3.3.8", "Accessible Authentication (Minimum)", "accessible-authentication-minimum"],
  ["3.3.9", "Accessible Authentication (Enhanced)", "accessible-authentication-enhanced"],
  ["4.1.1", "Parsing", "ensure-compat-parses"],
  ["4.1.2", "Name, Role, Value", "ensure-compat-rsv"],
  ["4.1.3", "Status Messages", "status-messages"],
];

const EXISTING_A11Y_FAILURES = new Set(["1.3.1", "2.4.4"]);

function toAuditKey(ruleId: string, title: string): string {
  return `wcag-${ruleId.replaceAll(".", "-")}-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

const wcag22CompletedAudits: AuditResult[] = WCAG22_QUICKREF_ITEMS.filter(
  ([ruleId]) => !EXISTING_A11Y_FAILURES.has(ruleId),
).map(([ruleId, title, anchor]) => ({
  audit: toAuditKey(ruleId, title),
  passed: true,
  category: "a11y",
  severity: "minor",
  ruleId: `WCAG ${ruleId}`,
  ruleUrl: `${WCAG22_QUICKREF_URL}#${anchor}`,
  message: `${title} check passed.`,
}));

export const mockCategorySettingsLinks = {
  brand: "https://app.storyblok.com/#/me/spaces/293515764469721/apps/192670910305875",
} as const;

export const mockAuditResults: AuditResult[] = [
  // ── A11y ─────────────────────────────────────────────────────────────────
  {
    audit: "accessibility-link-purpose",
    passed: false,
    category: "a11y",
    severity: "critical",
    ruleId: "WCAG 2.4.4",
    ruleUrl: `${WCAG22_QUICKREF_URL}#navigation-mechanisms-refs`,
    message: 'Link text "Click here for your application" does not describe the destination.',
    current: '"Click here for your application"',
    suggestion: '"Apply for your personal loan"',
    meta: {},
  },
  {
    audit: "accessibility-heading-order",
    passed: false,
    category: "a11y",
    severity: "critical",
    ruleId: "WCAG 1.3.1",
    ruleUrl: `${WCAG22_QUICKREF_URL}#content-structure-separation-programmatic`,
    message: "Heading order is invalid: found an H3 directly after H1.",
    current: "H1 → H3 (skips H2)",
    suggestion: "H1 → H2 → H3 (sequential hierarchy)",
    meta: {
      expectedOrder: "H1 -> H2 -> H3",
      foundOrder: "H1 -> H3",
      selector: "main section.hero h3",
    },
  },
  {
    audit: "accessibility-image-alt",
    passed: true,
    category: "a11y",
    severity: "minor",
    ruleId: "WCAG 1.1.1",
    ruleUrl: `${WCAG22_QUICKREF_URL}#text-equiv-all`,
    message: "All images have descriptive alt text.",
  },
  {
    audit: "accessibility-landmark-main",
    passed: true,
    category: "a11y",
    severity: "minor",
    ruleId: "WCAG 2.4.1",
    ruleUrl: `${WCAG22_QUICKREF_URL}#navigation-mechanisms-skip`,
    message: "Main landmark is present and unique.",
  },
  ...wcag22CompletedAudits,

  // ── AFM (readability) ─────────────────────────────────────────────────────
  {
    audit: "afm-sentence-length",
    passed: false,
    category: "afm",
    severity: "serious",
    ruleId: "AFM LH-2026 §3 (Het adviestraject)",
    ruleUrl: `${AFM_LEIDRAAD_HYPO_2026_URL}#page=8`,
    message: "Sentence exceeds the recommended 25-word limit (found 41 words).",
    current:
      '"Our dedicated team of financial advisors will work with you to understand your unique situation and develop a personalised plan that meets all of your specific needs."',
    suggestion:
      '"Our advisors take time to understand your situation. Together, we\'ll build a plan tailored to your needs."',
    meta: { wordCount: 41, limit: 25 },
  },
  {
    audit: "afm-passive-voice",
    passed: false,
    category: "afm",
    severity: "moderate",
    ruleId: "AFM LH-2026 §2 (De rol van de adviseur)",
    ruleUrl: `${AFM_LEIDRAAD_HYPO_2026_URL}#page=4`,
    message: "Passive voice detected — active voice improves clarity for customers.",
    current: '"Your application will be reviewed by our team within 3 business days."',
    suggestion: '"Our team will review your application within 3 business days."',
    meta: {},
  },
  {
    audit: "afm-readability-score",
    passed: true,
    category: "afm",
    severity: "minor",
    message: "Flesch-Kincaid readability score is within the acceptable range (Grade 8).",
  },

  // ── Brand ─────────────────────────────────────────────────────────────────
  {
    audit: "brand-tone-casual-language",
    passed: false,
    category: "brand",
    severity: "moderate",
    message: 'The word "easily" is too casual for Novabank\'s formal tone of voice.',
    current: '"Manage your loan easily via the app."',
    suggestion: '"Manage your loan with ease via the app."',
    meta: { flaggedWord: "easily" },
  },
  {
    audit: "brand-prohibited-jargon",
    passed: false,
    category: "brand",
    severity: "critical",
    message:
      '"Hassle-free" is on the prohibited jargon list — it trivialises the customer\'s financial journey.',
    current: '"Hassle-free loan management, anytime."',
    suggestion: '"Simple, straightforward loan management, anytime."',
    meta: { flaggedPhrase: "Hassle-free" },
  },
  {
    audit: "brand-tagline-present",
    passed: true,
    category: "brand",
    severity: "minor",
    message: "Brand tagline is present and correctly formatted.",
  },
];
