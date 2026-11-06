import {
  ALL_KNOWLEDGE_ITEMS,
  type KnowledgeItem,
  type ChatbotAnswer,
  type SearchResult,
} from "@/data/chatbot/knowledge";

// Common stop words that do not carry semantic weight in search
const STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "aren't",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "can't",
  "cannot",
  "could",
  "couldn't",
  "did",
  "didn't",
  "do",
  "does",
  "doesn't",
  "doing",
  "don't",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "hadn't",
  "has",
  "hasn't",
  "have",
  "haven't",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "i'd",
  "i'll",
  "i'm",
  "i've",
  "if",
  "in",
  "into",
  "is",
  "isn't",
  "it",
  "it's",
  "its",
  "itself",
  "let's",
  "me",
  "more",
  "most",
  "mustn't",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "ought",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "shan't",
  "she",
  "should",
  "shouldn't",
  "so",
  "some",
  "such",
  "than",
  "that",
  "that's",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "there's",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "wasn't",
  "we",
  "were",
  "weren't",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "with",
  "won't",
  "would",
  "wouldn't",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
]);

// Common semantic synonyms mapping to expand user intents
const SYNONYMS: Record<string, string[]> = {
  create: ["author", "make", "generate", "build", "launch"],
  test: ["quiz", "exam", "assessment"],
  exam: ["quiz", "integrity", "proctoring", "lockdown"],
  cheat: ["integrity", "proctoring", "fullscreen", "tab"],
  join: ["enter", "participate", "connect", "access"],
  leave: ["exit", "departure"],
  download: ["export", "pdf", "excel", "csv", "report"],
  report: ["export", "analytics", "summary", "archive"],
  present: ["embed", "slides", "powerpoint", "google slides"],
  code: ["shortcode", "pin", "access code"],
  score: ["grade", "accuracy", "points", "engagement"],
  student: ["participant", "learner"],
  teacher: ["faculty", "instructor", "professor"],
  admin: ["developer", "administrator", "telemetry"],
  builder: ["founder", "developer", "creator", "tharun", "navneeth"],
};

/**
 * Normalize and stem a term for robust indexing.
 */
function normalizeTerm(raw: string): string {
  let term = raw.toLowerCase().trim();
  term = term.replace(/[^a-z0-9]/g, "");
  // Simple suffix reductions
  if (term.endsWith("ies") && term.length > 4) {
    term = term.slice(0, -3) + "y";
  } else if (term.endsWith("es") && term.length > 4) {
    term = term.slice(0, -2);
  } else if (term.endsWith("s") && !term.endsWith("ss") && term.length > 3) {
    term = term.slice(0, -1);
  } else if (term.endsWith("ing") && term.length > 5) {
    term = term.slice(0, -3);
  } else if (term.endsWith("ed") && term.length > 4) {
    term = term.slice(0, -2);
  }
  return term;
}

/**
 * Extract tokens from raw text with stop-word elimination.
 */
function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const tokens: string[] = [];
  for (const w of words) {
    if (!STOP_WORDS.has(w) && w.length > 1) {
      tokens.push(normalizeTerm(w));
    }
  }
  return tokens;
}

interface IndexedItem {
  item: KnowledgeItem;
  titleTokens: Set<string>;
  keywordTokens: Set<string>;
  contentTokens: Set<string>;
  rawKeywords: string[];
  rawPhrases: string[];
}

let cachedIndex: IndexedItem[] | null = null;

/**
 * Build in-memory inverted index once.
 */
function getIndex(): IndexedItem[] {
  if (cachedIndex) return cachedIndex;

  cachedIndex = ALL_KNOWLEDGE_ITEMS.map((item) => {
    const titleTokens = new Set(tokenize(item.title));
    const keywordTokens = new Set<string>();
    const rawKeywords = item.keywords.map((k) => k.toLowerCase().trim());
    const rawPhrases = [
      item.title.toLowerCase(),
      ...rawKeywords,
      ...(item.suggestedQuestions?.map((q) => q.toLowerCase()) || []),
    ];

    for (const kw of item.keywords) {
      for (const t of tokenize(kw)) {
        keywordTokens.add(t);
      }
    }

    const contentTokens = new Set(tokenize(`${item.summary} ${item.content}`));

    return {
      item,
      titleTokens,
      keywordTokens,
      contentTokens,
      rawKeywords,
      rawPhrases,
    };
  });

  return cachedIndex;
}

/**
 * Search local repository knowledge base.
 */
export function searchKnowledge(query: string, limit = 3): SearchResult[] {
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) return [];

  const index = getIndex();
  const queryTokens = tokenize(cleanQuery);
  if (queryTokens.length === 0 && cleanQuery.length < 3) return [];

  // Expand query with synonyms
  const expandedTokens = new Set<string>(queryTokens);
  for (const t of queryTokens) {
    const syns = SYNONYMS[t] || [];
    for (const s of syns) {
      expandedTokens.add(normalizeTerm(s));
    }
  }

  const results: SearchResult[] = [];

  for (const entry of index) {
    let score = 0;
    const matchedKeywords: string[] = [];

    // 1. Exact phrase matching in phrases / title (Highest boost)
    for (const phrase of entry.rawPhrases) {
      if (phrase.length > 3 && cleanQuery.includes(phrase)) {
        score += 8.0;
        matchedKeywords.push(phrase);
      } else if (phrase.length > 4 && phrase.includes(cleanQuery)) {
        score += 5.0;
        matchedKeywords.push(phrase);
      }
    }

    // 2. Keyword matching in title (Weight: 3.5)
    for (const token of expandedTokens) {
      if (entry.titleTokens.has(token)) {
        score += 3.5;
        matchedKeywords.push(token);
      }
    }

    // 3. Keyword matching in declared keywords (Weight: 2.8)
    for (const token of expandedTokens) {
      if (entry.keywordTokens.has(token)) {
        score += 2.8;
        matchedKeywords.push(token);
      }
    }

    // 4. Keyword matching in body content (Weight: 1.0)
    let contentMatches = 0;
    for (const token of expandedTokens) {
      if (entry.contentTokens.has(token)) {
        contentMatches++;
        score += 1.0;
        matchedKeywords.push(token);
      }
    }

    // Bonus for multi-term coverage
    if (queryTokens.length > 1) {
      const allFound = queryTokens.every(
        (t) =>
          entry.titleTokens.has(t) ||
          entry.keywordTokens.has(t) ||
          entry.contentTokens.has(t),
      );
      if (allFound) {
        score += 4.0;
      }
    }

    if (score > 0) {
      results.push({
        item: entry.item,
        score,
        matchedKeywords: Array.from(new Set(matchedKeywords)),
      });
    }
  }

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

const MANDATED_FALLBACK =
  "I couldn't find reliable information about that in the KCT PULSE knowledge base. Please contact the appropriate faculty or support team for assistance.";

/**
 * Generate a complete, conversational answer directly from repository knowledge.
 * 100% locally evaluated with ZERO external AI API calls.
 */
export function queryKnowledgeBase(
  userQuery: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): ChatbotAnswer {
  const trimmed = userQuery.trim();
  if (!trimmed) {
    return {
      answer: MANDATED_FALLBACK,
      sources: [],
      confidence: 0,
    };
  }

  // Follow-up context extraction: if user query is very short, supplement with prior user turns
  let contextualQuery = trimmed;
  if (trimmed.split(/\s+/).length <= 3 && history.length > 0) {
    const priorUserMsgs = history
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .slice(-2);
    contextualQuery = `${priorUserMsgs.join(" ")} ${trimmed}`;
  }

  // Execute search
  const matches = searchKnowledge(contextualQuery, 2);

  // Confidence threshold
  if (matches.length === 0 || matches[0].score < 2.0) {
    return {
      answer: MANDATED_FALLBACK,
      sources: [],
      confidence: matches.length > 0 ? matches[0].score : 0,
      suggestedFollowUps: [
        "How do students join a session?",
        "What interactive formats are supported?",
        "How is the engagement score calculated?",
        "How do I export PDF reports?",
      ],
    };
  }

  const primaryMatch = matches[0];
  const secondaryMatch =
    matches.length > 1 && matches[1].score > primaryMatch.score * 0.65
      ? matches[1]
      : null;

  // Construct structured, readable response
  let responseText = primaryMatch.item.content;

  if (secondaryMatch && secondaryMatch.item.id !== primaryMatch.item.id) {
    responseText += `\n\n📌 Related — ${secondaryMatch.item.title}:\n${secondaryMatch.item.summary}`;
  }

  const sources = [
    {
      id: primaryMatch.item.id,
      title: primaryMatch.item.title,
      category: primaryMatch.item.category,
    },
  ];

  if (secondaryMatch && secondaryMatch.item.id !== primaryMatch.item.id) {
    sources.push({
      id: secondaryMatch.item.id,
      title: secondaryMatch.item.title,
      category: secondaryMatch.item.category,
    });
  }

  // Suggest relevant follow-ups
  const followUps = primaryMatch.item.suggestedQuestions || [
    "How do students join a session?",
    "How does the engagement formula work?",
  ];

  return {
    answer: responseText,
    sources,
    confidence: primaryMatch.score,
    suggestedFollowUps: followUps.slice(0, 3),
  };
}
