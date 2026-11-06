import type { KnowledgeItem } from "./types";

export const faqsKnowledge: KnowledgeItem[] = [
  {
    id: "kb-faqs",
    title: "Frequently Asked Questions (FAQs)",
    category: "FAQs",
    summary:
      "Answers to the most frequently asked faculty and student questions across the platform.",
    content:
      "Frequently Asked Questions:\n" +
      "Q: Do students need an app or account?\n" +
      "A: No. Students participate instantly via mobile web browsers by entering the session shortcode or scanning the QR code.\n\n" +
      "Q: Can I run KCT PULSE alongside PowerPoint or Google Slides?\n" +
      "A: Yes! Use the `/embed/$code` view as an iframe directly inside your presentation decks.\n\n" +
      "Q: How many students can join a single session?\n" +
      "A: KCT PULSE supports hundreds of concurrent students per auditorium powered by Supabase Realtime WebSocket infrastructure.\n\n" +
      "Q: Can multiple faculty teach together?\n" +
      "A: Yes. Use the Co-Host feature to share question controls and analytics with departmental colleagues.\n\n" +
      "Q: Where are student answers stored?\n" +
      "A: Answers are persisted in Supabase PostgreSQL and can be exported anytime to official PDF, CSV, and Excel archives.",
    keywords: [
      "faq",
      "faqs",
      "frequently asked questions",
      "common questions",
      "how many students",
      "capacity",
      "can i use powerpoint",
      "cohosting questions",
    ],
    suggestedQuestions: [
      "Do students need to install an app?",
      "How many students can join simultaneously?",
      "Can multiple instructors co-host a session?",
    ],
    relatedTopics: ["kb-platform-overview", "kb-pulse-features", "kb-student-experience"],
  },
];

