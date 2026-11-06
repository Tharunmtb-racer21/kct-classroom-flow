export interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  keywords: string[];
  suggestedQuestions?: string[];
  relatedTopics?: string[];
}

export interface SearchResult {
  item: KnowledgeItem;
  score: number;
  matchedKeywords: string[];
}

export interface ChatbotAnswer {
  answer: string;
  sources: Array<{ id: string; title: string; category: string }>;
  confidence: number;
  suggestedFollowUps?: string[];
}

