import type { KnowledgeItem } from "./types";

export const studentWorkflowsKnowledge: KnowledgeItem[] = [
  {
    id: "kb-student-experience",
    title: "Student Portal & Answering Experience (/join/$code)",
    category: "Student",
    summary:
      "Zero-friction student participation: no account creation, no password, instant joining via 6-character shortcode or QR code.",
    content:
      "Students interact with KCT PULSE through a streamlined mobile-first interface:\n" +
      "1. No Login Required: Students never need to register an account or download an app. They simply navigate to the join URL.\n" +
      "2. Entering Details: Students provide their Name and optional institutional Roll Number (e.g. 'Navneeth V 25BIT057').\n" +
      "3. Live Synchronization: Questions appear on student screens instantly over Supabase WebSocket channels (<50ms latency).\n" +
      "4. Interactive Formats: Students answer single-choice/multi-choice polls, timed graded quizzes, and submit keywords to dynamic word clouds.\n" +
      "5. Response Confirmation & Haptics: Confirms successful submission with color-coded feedback and mobile vibration/haptic cues.\n" +
      "6. Connection Quality Indicator: A real-time ping indicator in the mobile header informs students of their connection latency (e.g., 42ms 🟢).",
    keywords: [
      "student",
      "join",
      "participate",
      "answering",
      "student workflow",
      "student experience",
      "no login",
      "mobile",
      "smartphone",
      "haptic",
      "latency indicator",
      "how do students answer",
    ],
    suggestedQuestions: [
      "Do students need to create an account?",
      "How do students submit their answers?",
      "What happens if a student has slow internet?",
    ],
    relatedTopics: ["kb-session-joining", "kb-responses-participation", "kb-exam-integrity"],
  },
  {
    id: "kb-exam-integrity",
    title: "Exam Integrity Mode & Proctoring Protections",
    category: "Student",
    summary:
      "Anti-cheating protections for graded quizzes including tab-departure tracking, fullscreen exit limits, and clipboard restrictions.",
    content:
      "When a faculty member enables Exam Integrity Mode on a graded quiz, the student participation portal activates protective proctoring controls:\n" +
      "• Fullscreen Enforcement: Prompts students to lock their mobile/desktop browser into fullscreen mode during the quiz.\n" +
      "• Tab Departure & Blur Detection: Tracks when a student backgrounds the browser tab, minimizes the window, or switches apps.\n" +
      "• Violation Threshold: The platform logs each exit event with timestamps. If a student exceeds the allowed limit (e.g., 3 exits), their session is flagged.\n" +
      "• Clipboard & Interaction Locks: Disables text copying, pasting, and right-click context menus on question prompts.",
    keywords: [
      "exam integrity",
      "proctoring",
      "anti-cheat",
      "cheating",
      "tab switch",
      "fullscreen",
      "clipboard",
      "copy paste",
      "right click",
      "integrity violations",
    ],
    suggestedQuestions: [
      "How does Exam Integrity Mode prevent cheating?",
      "What happens if a student switches tabs during a quiz?",
      "Can students copy question text?",
    ],
    relatedTopics: ["kb-student-experience", "kb-question-types"],
  },
];
