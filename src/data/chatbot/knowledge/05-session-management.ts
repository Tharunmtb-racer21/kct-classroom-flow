import type { KnowledgeItem } from "./types";

export const sessionManagementKnowledge: KnowledgeItem[] = [
  {
    id: "kb-session-management",
    title: "Classroom Session Management & Workspace (/dashboard/sessions)",
    category: "Sessions",
    summary:
      "Creating, organizing, renaming, and deleting classroom sessions alongside curated departmental question banks.",
    content:
      "On the Sessions page (`/dashboard/sessions`), instructors manage their teaching catalog:\n" +
      "• Dual Workspace Tabs:\n" +
      "  - Personal Sessions: Lists sessions authored by the faculty member with participant counts, question inventories, and live status tags.\n" +
      "  - Department Templates: Curated institutional question banks for departments like Computer Science (CSE), Electrical Engineering (EEE), Mathematics, and Science & Humanities.\n" +
      "• Template Cloning: Copy a pre-built departmental template into a personal workspace with a single click, generating an independent shortcode.\n" +
      "• Session Lifecycle Statuses:\n" +
      "  - Draft (📝): Editing mode; students cannot submit responses yet.\n" +
      "  - Live (🟢): Active presentation mode; students can join and submit live votes.\n" +
      "  - Ended (🏁): Lecture concluded; final results saved, ready for reporting.\n" +
      "• Safe Management: In-place title renaming, co-host assignment, and deletion with confirmation guards.",
    keywords: [
      "sessions",
      "session management",
      "create session",
      "templates",
      "department templates",
      "clone",
      "draft",
      "live",
      "ended",
      "rename session",
      "delete session",
      "workspace",
    ],
    suggestedQuestions: [
      "How do I clone a department template?",
      "What is the difference between Draft, Live, and Ended status?",
      "Can I rename a session after creating it?",
    ],
    relatedTopics: ["kb-faculty-workflows", "kb-cohosting", "kb-auto-draft-policy"],
  },
  {
    id: "kb-cohosting",
    title: "Faculty Co-Hosting & Collaborative Teaching",
    category: "Sessions",
    summary:
      "Invite departmental colleagues via their @kct.ac.in email to co-manage active lectures, questions, and live analytics.",
    content:
      "KCT PULSE enables team teaching and collaborative lecture delivery through Faculty Co-Hosting:\n" +
      "• Adding a Co-Host: Open any session settings, enter a colleague's official `@kct.ac.in` institutional email address, and send the co-host invitation.\n" +
      "• Co-Host Permissions: Co-hosts gain shared control over question launching, advancing slides, viewing live student response counters, and accessing analytics.\n" +
      "• Security Protection: Only faculty members with verified institutional email addresses can be added as co-hosts.",
    keywords: [
      "cohost",
      "co-host",
      "collaborate",
      "share session",
      "team teaching",
      "colleague",
      "add faculty",
      "assistant instructor",
    ],
    suggestedQuestions: [
      "How do I add a co-host to my session?",
      "Can another faculty member control my questions?",
      "Who can be added as a co-host?",
    ],
    relatedTopics: ["kb-session-management", "kb-faculty-workflows"],
  },
  {
    id: "kb-auto-draft-policy",
    title: "1-Hour Inactivity Auto-Draft Policy",
    category: "Sessions",
    summary:
      "Automated server cleanup that moves live sessions back to draft status after 1 hour to prevent stale sessions.",
    content:
      "To optimize database performance and prevent abandoned live sessions from accepting unintended student submissions, KCT PULSE implements an automated 1-hour lifecycle rule:\n" +
      "• Behavior: Any session in `live` status for longer than 60 minutes or exceeding its `expires_at` timestamp is automatically reverted to `draft` status.\n" +
      "• Background Process: An automated cleanup runner (`autoDraftStaleSessions`) evaluates active session timestamps periodically and updates the Supabase status.\n" +
      "• Resuming a Session: Faculty can reactivate any session back to `live` at any time from their control panel with one click.",
    keywords: [
      "auto draft",
      "auto-draft",
      "expire",
      "1 hour",
      "timeout",
      "stale session",
      "automatic cleanup",
      "why did my session close",
    ],
    suggestedQuestions:
      [
        "Why did my live session change back to draft?",
        "How long can a session stay live?",
        "Can I reopen an expired session?",
      ],
    relatedTopics: ["kb-session-management", "kb-troubleshooting"],
  },
];
