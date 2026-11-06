import type { KnowledgeItem } from "./types";
import { platformOverviewKnowledge } from "./01-platform-overview";
import { kctPulseFeaturesKnowledge } from "./02-kct-pulse-features";
import { studentWorkflowsKnowledge } from "./03-student-workflows";
import { facultyDashboardKnowledge } from "./04-faculty-dashboard";
import { sessionManagementKnowledge } from "./05-session-management";
import { sessionCodesJoiningKnowledge } from "./06-session-codes-joining";
import { questionsPollsQuizzesKnowledge } from "./07-questions-polls-quizzes";
import { responsesParticipationKnowledge } from "./08-responses-participation";
import { classroomIntelligenceKnowledge } from "./09-classroom-intelligence";
import { engagementAnalyticsKnowledge } from "./10-engagement-analytics";
import { reportsAnalyticsKnowledge } from "./11-reports-analytics";
import { developerPortalKnowledge } from "./12-developer-portal";
import { loginAuthenticationKnowledge } from "./13-login-authentication";
import { troubleshootingKnowledge } from "./14-troubleshooting";
import { faqsKnowledge } from "./15-faqs";
import { privacySecurityKnowledge } from "./16-privacy-security";

export * from "./types";

/**
 * Complete, in-repository structured knowledge base for KCT PULSE.
 * Maintained locally with 0 external API dependencies.
 */
export const ALL_KNOWLEDGE_ITEMS: KnowledgeItem[] = [
  ...platformOverviewKnowledge,
  ...kctPulseFeaturesKnowledge,
  ...studentWorkflowsKnowledge,
  ...facultyDashboardKnowledge,
  ...sessionManagementKnowledge,
  ...sessionCodesJoiningKnowledge,
  ...questionsPollsQuizzesKnowledge,
  ...responsesParticipationKnowledge,
  ...classroomIntelligenceKnowledge,
  ...engagementAnalyticsKnowledge,
  ...reportsAnalyticsKnowledge,
  ...developerPortalKnowledge,
  ...loginAuthenticationKnowledge,
  ...troubleshootingKnowledge,
  ...faqsKnowledge,
  ...privacySecurityKnowledge,
];

/**
 * Quick access lookup map by ID
 */
export const KNOWLEDGE_BY_ID = new Map<string, KnowledgeItem>(
  ALL_KNOWLEDGE_ITEMS.map((item) => [item.id, item]),
);

