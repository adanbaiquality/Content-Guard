import { type AuditResult } from "@/types";

const AFM_LEIDRAAD_HYPO_2026_URL =
  "https://www.afm.nl/~/profmedia/files/wet-regelgeving/beleidsuitingen/leidraden/leidraad-hypotheekadvisering-herzien-2026.pdf";

export const mockAuditResults: AuditResult[] = [
  // ── A11y ─────────────────────────────────────────────────────────────────
  {
    audit: "accessibility-link-purpose",
    passed: false,
    category: "a11y",
    severity: "blocking",
    ruleId: "WCAG 2.4.4",
    message: 'Link text "Click here for your application" does not describe the destination.',
    current: '"Click here for your application"',
    suggestion: '"Apply for your personal loan"',
    meta: {},
  },
  {
    audit: "accessibility-heading-order",
    passed: false,
    category: "a11y",
    severity: "blocking",
    ruleId: "WCAG 1.3.1",
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
    severity: "info",
    message: "All images have descriptive alt text.",
  },
  {
    audit: "accessibility-landmark-main",
    passed: true,
    category: "a11y",
    severity: "info",
    message: "Main landmark is present and unique.",
  },

  // ── AFM (readability) ─────────────────────────────────────────────────────
  {
    audit: "afm-sentence-length",
    passed: false,
    category: "afm",
    severity: "blocking",
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
    severity: "warning",
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
    severity: "info",
    message: "Flesch-Kincaid readability score is within the acceptable range (Grade 8).",
  },

  // ── Brand ─────────────────────────────────────────────────────────────────
  {
    audit: "brand-tone-casual-language",
    passed: false,
    category: "brand",
    severity: "warning",
    message: 'The word "easily" is too casual for Novabank\'s formal tone of voice.',
    current: '"Manage your loan easily via the app."',
    suggestion: '"Manage your loan with ease via the app."',
    meta: { flaggedWord: "easily" },
  },
  {
    audit: "brand-prohibited-jargon",
    passed: false,
    category: "brand",
    severity: "blocking",
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
    severity: "info",
    message: "Brand tagline is present and correctly formatted.",
  },
];
