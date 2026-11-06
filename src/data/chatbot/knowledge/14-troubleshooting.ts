import type { KnowledgeItem } from "./types";

export const troubleshootingKnowledge: KnowledgeItem[] = [
  {
    id: "kb-troubleshooting",
    title: "Troubleshooting & Common Classroom Issues",
    category: "Troubleshooting",
    summary:
      "Solutions for frequent lecture hall scenarios: expired sessions, slow internet, QR code scanning, and audio/voice input.",
    content:
      "Quick fixes for common classroom scenarios:\n" +
      "1. 'Session Not Found' or 'Session Ended':\n" +
      "   - Check that the instructor has toggled the session to `🟢 Live` status in their control room.\n" +
      "   - Check if the 6-character code was entered correctly (case-insensitive).\n" +
      "   - Note: Sessions automatically revert to `draft` after 1 hour of inactivity. Faculty can re-activate the session with one click.\n" +
      "2. Student Cannot Scan Projector QR Code:\n" +
      "   - Students in back rows can simply type the 6-character code on the homepage (`/`) instead of scanning.\n" +
      "   - Faculty can also share the direct join URL in Google Classroom or Teams.\n" +
      "3. High Network Latency in Large Auditoriums:\n" +
      "   - The mobile header includes a color-coded latency indicator (🟢 <100ms, 🟡 100-300ms, 🔴 >300ms).\n" +
      "   - Submissions are queued optimistically and retried automatically over Supabase WebSockets.\n" +
      "4. Forgotten Password:\n" +
      "   - Faculty can click 'Forgot Password?' on the `/auth` page to receive a password reset link to their `@kct.ac.in` inbox.",
    keywords: [
      "troubleshooting",
      "error",
      "fix",
      "session not found",
      "cannot join",
      "qr code not working",
      "slow internet",
      "latency",
      "forgot password",
      "session ended",
      "help",
    ],
    suggestedQuestions: [
      "What should I do if students see 'Session Ended'?",
      "How do students join if the QR code won't scan?",
      "How can faculty reset their password?",
    ],
    relatedTopics: ["kb-session-joining", "kb-auto-draft-policy", "kb-login-auth"],
  },
];
