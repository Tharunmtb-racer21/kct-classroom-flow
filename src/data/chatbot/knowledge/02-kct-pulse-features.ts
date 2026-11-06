import type { KnowledgeItem } from "./types";

export const kctPulseFeaturesKnowledge: KnowledgeItem[] = [
  {
    id: "kb-pulse-features",
    title: "Core Platform Capabilities & Features",
    category: "Features",
    summary:
      "Comprehensive suite of real-time polling, quizzes, word clouds, slide presentation embedding, intelligence analytics, and PDF/Excel reports.",
    content:
      "KCT PULSE includes eight core functional modules:\n" +
      "1. Faculty Command Center (/dashboard): Live statistics, real-time sync indicator, active session controls, and quick creation.\n" +
      "2. Classroom Sessions & Templates (/dashboard/sessions): Personal lectures and curated departmental question banks (CSE, EEE, Maths, Chemistry).\n" +
      "3. Zero-Friction Student Portal (/join/$code): Instant mobile connectivity via Supabase WebSockets with real-time sync without logins.\n" +
      "4. Presentation Embed Engine (/embed/$code): Frameless layout with projector QR code designed for PowerPoint and Google Slides iframes.\n" +
      "5. Classroom Intelligence & ML (/dashboard/intelligence): 0–100 formula engagement scoring, concept accuracy tracking, and weak topic alerts.\n" +
      "6. Analytical Reports (/dashboard/reports): Exportable lecture archives in PDF, Excel (.xlsx), and CSV formats.\n" +
      "7. Security Intelligence & WAF (/dashboard/security and /developer-waf): IP rate limiting, token bucket controls, and anomaly detection.\n" +
      "8. Developer Telemetry Portal (/developer): System monitoring, login logs audit trail, and database health benchmarks.",
    keywords: [
      "features",
      "capabilities",
      "modules",
      "functions",
      "what can i do",
      "core features",
      "functionality",
      "embed",
      "powerpoint",
      "google slides",
      "word cloud",
      "quiz",
      "poll",
    ],
    suggestedQuestions: [
      "What are the main features of KCT PULSE?",
      "Can I embed KCT PULSE inside PowerPoint or Google Slides?",
      "What question formats are supported?",
    ],
    relatedTopics: ["kb-presentation-embed", "kb-question-types", "kb-intelligence-overview"],
  },
  {
    id: "kb-presentation-embed",
    title: "Slide Presentation Embed View (/embed/$code)",
    category: "Features",
    summary:
      "Frameless live visualization and projector QR code for embedding directly into PowerPoint or Google Slides presentations.",
    content:
      "Faculty can integrate live session results directly into PowerPoint and Google Slides using the embed view at `/embed/$code`:\n" +
      "• Frameless Projection Layout: Removes unnecessary navigation bars, headers, and dashboard clutter for clean auditorium display.\n" +
      "• High-Contrast Projector QR Code: Automatically generated for students in back-row auditorium seats to scan with their phones.\n" +
      "• Live Real-Time Synchronized Visualizations: Bar charts and animated word clouds update in real time as student votes arrive.\n" +
      "• How to use: In Google Slides or PowerPoint, insert an iframe web object pointing to `https://kct-classroom-flow.vercel.app/embed/YOUR_SESSION_CODE`.",
    keywords: [
      "embed",
      "presentation",
      "powerpoint",
      "google slides",
      "iframe",
      "projection",
      "projector",
      "qr code",
      "slides",
      "how to embed",
    ],
    suggestedQuestions: [
      "How do I embed KCT PULSE into Google Slides?",
      "Can I show live charts inside my PowerPoint slides?",
      "What is the embed URL format?",
    ],
    relatedTopics: ["kb-pulse-features", "kb-session-joining"],
  },
];

