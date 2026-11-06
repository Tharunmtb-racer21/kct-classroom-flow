import type { KnowledgeItem } from "./types";

export const facultyDashboardKnowledge: KnowledgeItem[] = [
  {
    id: "kb-faculty-workflows",
    title: "Faculty Dashboard & Navigation (/dashboard)",
    category: "Faculty",
    summary:
      "Faculty control center with real-time KPI metrics, active session controls, database sync status, and quick-action toolbars.",
    content:
      "The Faculty Command Center (`/dashboard`) provides instructors with a complete administrative interface:\n" +
      "• Real-Time KPI Suite: Live counters displaying total active sessions, current listeners in lecture halls, questions authored, and overall classroom engagement velocity.\n" +
      "• Live Database Sync Badge: Color-coded WebSocket health pill showing real-time connectivity to Supabase channels.\n" +
      "• One-Click Session Creator: Rapid modal to launch a new lecture session with an auto-generated alphanumeric session code.\n" +
      "• Sidebar Navigation:\n" +
      "  - Dashboard (/dashboard): Main overview & KPI counters.\n" +
      "  - Sessions (/dashboard/sessions): Session management & departmental templates.\n" +
      "  - Intelligence (/dashboard/intelligence): Learning analytics, weak topic diagnostics, and engagement scoring.\n" +
      "  - Reports (/dashboard/reports): Export PDF, CSV, and Excel session reports.\n" +
      "  - Security (/dashboard/security): WAF metrics, traffic rates, and threat analysis.\n" +
      "  - Guide (/dashboard/guide): Step-by-step pictorial faculty manual.",
    keywords: [
      "faculty",
      "dashboard",
      "faculty dashboard",
      "command center",
      "kpi",
      "metrics",
      "navigation",
      "menu",
      "sidebar",
      "live sync",
      "how to use dashboard",
    ],
    suggestedQuestions: [
      "What is shown on the Faculty Dashboard?",
      "How do I create a new lecture session?",
      "What is the Live Database Sync badge?",
    ],
    relatedTopics: ["kb-session-management", "kb-intelligence-overview", "kb-reports-analytics"],
  },
  {
    id: "kb-faculty-guide",
    title: "Step-by-Step Faculty Walkthrough (/dashboard/guide)",
    category: "Faculty",
    summary:
      "Standard 8-step teaching workflow from sign-in and question preparation to running live lectures and exporting reports.",
    content:
      "The Faculty Guide (`/dashboard/guide`) outlines the standardized 8-step lecture lifecycle:\n" +
      "1. Sign in: Faculty logs in with their @kct.ac.in institutional account.\n" +
      "2. Create session: Create a lecture from scratch or clone a curated department template.\n" +
      "3. Add questions: Author MCQs, word clouds, or polls with custom time limits and images.\n" +
      "4. AI generate (optional): Upload a lecture PDF/DOCX to auto-generate questions.\n" +
      "5. Share with students: Project the alphanumeric session code or auditorium QR code.\n" +
      "6. Run live: Launch questions individually, activate all at once, or use Auto Play.\n" +
      "7. Review responses: Watch student submissions morph live on animated charts.\n" +
      "8. Export report: Download official PDF/Excel archives for academic accreditation and records.",
    keywords: [
      "guide",
      "manual",
      "steps",
      "workflow",
      "how to teach",
      "lecture lifecycle",
      "tutorial",
      "walkthrough",
      "pictorial workflow",
    ],
    suggestedQuestions: [
      "What are the steps to conduct a live lecture?",
      "How do I share a session with my students?",
      "Can I run questions automatically?",
    ],
    relatedTopics: ["kb-faculty-workflows", "kb-session-management"],
  },
];

