import type { KnowledgeItem } from "./types";

export const sessionCodesJoiningKnowledge: KnowledgeItem[] = [
  {
    id: "kb-session-joining",
    title: "Session Codes & Student Joining Procedures",
    category: "Joining",
    summary:
      "Students connect instantly using an alphanumeric session code, direct link, or projector QR code without an account.",
    content:
      "KCT PULSE offers three simple ways for students to join an active classroom session:\n" +
      "1. Alphanumeric Session Code: Every lecture generates a unique code (e.g. `KCT821` or `KCT` followed by random characters). Students go to the homepage (`/`) and type the code.\n" +
      "2. Projector QR Code: Faculty can project the high-contrast QR code on the auditorium screen. Students open their phone camera and tap the link to join directly.\n" +
      "3. Direct URL: Faculty can share the direct join link in Google Classroom or Microsoft Teams in the format: `https://kct-classroom-flow.vercel.app/join/CODE`.\n" +
      "Upon arriving, students enter their display name and optional roll number to enter the live waiting room.",
    keywords: [
      "session code",
      "shortcode",
      "joining",
      "how to join",
      "qr code",
      "join link",
      "student access",
      "code format",
      "enter code",
    ],
    suggestedQuestions: [
      "How do students join a live class?",
      "What format is the session code?",
      "Can students scan a QR code to enter?",
    ],
    relatedTopics: ["kb-student-experience", "kb-session-management"],
  },
];

