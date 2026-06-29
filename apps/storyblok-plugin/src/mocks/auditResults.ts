import { type AuditResult } from "@/types";

export const mockAuditResults: AuditResult[] = [
  {
    audit: "accessibility-heading-order",
    passed: false,
    message: "Heading order is invalid: found an H3 directly after H1.",
    meta: {
      expectedOrder: "H1 -> H2 -> H3",
      foundOrder: "H1 -> H3",
      selector: "main section.hero h3",
    },
  },
  {
    audit: "preview-a11y-axe",
    passed: false,
    message: "Found 2 accessibility violations on preview page.",
    meta: {
      previewUrl: "https://preview.example.com",
      violations: [
        {
          id: "heading-order",
          impact: "moderate",
          description: "Heading levels should only increase by one.",
          nodes: 1,
        },
        {
          id: "color-contrast",
          impact: "serious",
          description: "Text color contrast is below the minimum threshold.",
          nodes: 3,
        },
      ],
    },
  },
  {
    audit: "accessibility-landmark-main",
    passed: true,
    message: "Main landmark is present and unique.",
  },
];
