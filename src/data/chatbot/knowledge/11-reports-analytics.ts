import type { KnowledgeItem } from "./types";

export const reportsAnalyticsKnowledge: KnowledgeItem[] = [
  {
    id: "kb-reports-analytics",
    title: "Session Analytics & PDF/Excel Reports (/dashboard/reports)",
    category: "Reports",
    summary:
      "Export comprehensive lecture summaries to PDF, Excel, and CSV files for academic evidence and accreditation.",
    content:
      "The Reports module (`/dashboard/reports`) allows faculty to generate exportable documentation of classroom activity:\n" +
      "• Formats Supported:\n" +
      "  - PDF Reports (.pdf): Professionally styled lecture summaries with college header, question breakdown charts, attendance lists, and student scorecards.\n" +
      "  - Excel Spreadsheets (.xlsx): Raw tabulated data featuring separate sheets for questions, participants, scores, and timestamped response rows.\n" +
      "  - CSV Exports (.csv): Lightweight comma-separated archives suitable for institutional LMS imports (Moodle, Canvas, Google Classroom).\n" +
      "• Aggregated Statistics: Summary cards calculate total students taught across all classes, questions authored, and average class-wide response rates.\n" +
      "• Resilience: Report queries include automatic retry fallbacks to handle transient network hiccups smoothly.",
    keywords: [
      "reports",
      "export",
      "pdf",
      "excel",
      "csv",
      "download report",
      "analytics export",
      "accreditation evidence",
      "how to download report",
      "session report",
    ],
    suggestedQuestions: [
      "How do I download a PDF report of my class?",
      "Can I export student scores to Excel or CSV?",
      "Can I import results into Google Classroom or Moodle?",
    ],
    relatedTopics: ["kb-faculty-workflows", "kb-intelligence-overview"],
  },
];

