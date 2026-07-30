/**
 * local-question-generator.ts
 *
 * A rule-based question generator that runs 100% in the browser.
 * No API keys. No downloads. No internet required.
 *
 * How it works:
 *   1. Tokenize the document text and remove common stop words
 *   2. Score words by frequency (TF-IDF-like) to find keywords
 *   3. Extract the most important sentences (ones with the most keywords)
 *   4. Use smart templates to turn sentences + keywords into questions
 *   5. Generate distractors (wrong options) from other keywords
 */

import type { GeneratedQuestion, QType } from "./ai-service";

// ─── English Stop Words (common words to ignore) ──────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "shall", "can", "need", "must", "it", "its", "this", "that",
  "these", "those", "i", "you", "he", "she", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "our", "their", "mine", "yours", "hers",
  "ours", "theirs", "what", "which", "who", "whom", "whose", "when", "where",
  "why", "how", "if", "then", "else", "so", "no", "not", "only", "very",
  "also", "just", "than", "too", "each", "every", "all", "both", "few",
  "more", "most", "other", "some", "such", "any", "many", "much", "own",
  "same", "about", "above", "after", "again", "against", "before", "below",
  "between", "during", "into", "through", "under", "until", "up", "down",
  "out", "off", "over", "here", "there", "further", "once", "as", "while",
  "because", "since", "although", "however", "therefore", "thus", "hence",
  "yet", "still", "already", "even", "now", "then", "like", "get", "got",
  "make", "made", "take", "took", "come", "came", "go", "went", "see", "saw",
  "know", "knew", "think", "thought", "say", "said", "use", "used", "find",
  "found", "give", "gave", "tell", "told", "work", "become", "leave", "put",
  "mean", "keep", "let", "begin", "seem", "help", "show", "hear", "play",
  "run", "move", "try", "ask", "new", "old", "first", "last", "long", "great",
  "little", "own", "right", "big", "small", "large", "next", "early", "young",
  "important", "public", "bad", "good", "well", "way", "case", "point",
  "part", "place", "time", "year", "day", "thing", "man", "woman", "child",
  "world", "life", "hand", "high", "low", "number", "different", "another",
  "example", "following", "using", "called", "based", "include", "including",
  "within", "given", "without", "set", "among", "often", "per", "along",
  "may", "able", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "also", "well", "back", "being", "after",
  "etc", "eg", "ie", "vs", "via",
]);

// ─── Text Processing Utilities ────────────────────────────────────────────────

/** Clean and tokenize text into words */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")  // Remove punctuation except hyphens/apostrophes
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Split text into sentences */
function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, ". ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 300); // Only meaningful sentences
}

/** Capitalize first letter */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Title-case a word (for display) */
function titleCase(word: string): string {
  return word
    .split(/[-\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Keyword Extraction (TF-IDF-like) ─────────────────────────────────────────

interface KeywordScore {
  word: string;
  score: number;
  displayForm: string; // Original casing from the text
}

/** Extract top keywords from text using frequency scoring */
function extractKeywords(text: string, maxKeywords = 30): KeywordScore[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];

  // Count word frequencies
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  // Find original casing from text
  const originalCase = new Map<string, string>();
  const words = text.match(/[A-Za-z][\w'-]*/g) || [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (freq.has(lower) && !originalCase.has(lower)) {
      originalCase.set(lower, w);
    }
  }

  // Score: frequency × word length bonus (longer words are often more meaningful)
  const scored: KeywordScore[] = [];
  for (const [word, count] of freq) {
    const lengthBonus = Math.min(word.length / 6, 1.5);
    const score = count * lengthBonus;
    scored.push({
      word,
      score,
      displayForm: originalCase.get(word) || titleCase(word),
    });
  }

  // Sort by score descending and return top N
  return scored.sort((a, b) => b.score - a.score).slice(0, maxKeywords);
}

// ─── Key Sentence Extraction ──────────────────────────────────────────────────

interface ScoredSentence {
  text: string;
  score: number;
  keywords: string[]; // Keywords found in this sentence
}

/** Find the most important sentences based on keyword density */
function extractKeySentences(
  text: string,
  keywords: KeywordScore[],
  maxSentences = 20
): ScoredSentence[] {
  const sentences = splitSentences(text);
  const keywordSet = new Set(keywords.map((k) => k.word));

  const scored: ScoredSentence[] = sentences.map((sentence) => {
    const sentenceTokens = tokenize(sentence);
    const foundKeywords = sentenceTokens.filter((t) => keywordSet.has(t));
    const uniqueKeywords = [...new Set(foundKeywords)];

    return {
      text: sentence.replace(/\.$/, "").trim(),
      score: uniqueKeywords.length,
      keywords: uniqueKeywords,
    };
  });

  return scored
    .filter((s) => s.score >= 1) // At least 1 keyword
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences);
}

// ─── Question Generation Templates ───────────────────────────────────────────

/** Generate quiz questions (MCQ with correct answer) */
function generateQuizQuestions(
  sentences: ScoredSentence[],
  keywords: KeywordScore[],
  count: number
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];
  const usedSentences = new Set<number>();
  const allKeywords = keywords.map((k) => k.displayForm);

  // Quiz templates — pick a keyword from a sentence and ask about it
  const templates = [
    (keyword: string, context: string) =>
      `According to the document, what is "${keyword}" related to?`,
    (keyword: string, context: string) =>
      `Which of the following best describes "${keyword}"?`,
    (keyword: string, context: string) =>
      `What role does "${keyword}" play in the context discussed?`,
    (keyword: string, context: string) =>
      `The document mentions "${keyword}". What is its significance?`,
    (keyword: string, context: string) =>
      `Which statement about "${keyword}" is correct based on the text?`,
    (keyword: string, context: string) =>
      `What concept is most closely associated with "${keyword}"?`,
    (keyword: string, context: string) =>
      `In the context of the document, "${keyword}" primarily refers to:`,
    (keyword: string, context: string) =>
      `Which of the following is true about "${keyword}"?`,
  ];

  for (let i = 0; i < sentences.length && questions.length < count; i++) {
    if (usedSentences.has(i)) continue;

    const sentence = sentences[i];
    if (sentence.keywords.length === 0) continue;

    // Pick the best keyword from this sentence
    const mainKeyword = sentence.keywords[0];
    const mainKeywordDisplay =
      keywords.find((k) => k.word === mainKeyword)?.displayForm ||
      titleCase(mainKeyword);

    // Correct answer — a phrase from the sentence itself
    const correctAnswer = sentence.text.length > 80
      ? sentence.text.slice(0, 77) + "..."
      : sentence.text;

    // Generate 3 distractor options from other keywords/sentences
    const distractors = generateDistractors(
      correctAnswer,
      sentences,
      i,
      allKeywords,
      3
    );

    if (distractors.length < 3) continue; // Need exactly 3 distractors

    // Pick a random template
    const template = templates[questions.length % templates.length];
    const title = template(mainKeywordDisplay, sentence.text);

    // Shuffle options (correct answer + distractors)
    const options = shuffleArray([correctAnswer, ...distractors]);

    questions.push({
      type: "quiz",
      title,
      options,
      correct_answer: correctAnswer,
    });

    usedSentences.add(i);
  }

  return questions;
}

/** Generate distractor options (wrong answers) */
function generateDistractors(
  correctAnswer: string,
  sentences: ScoredSentence[],
  correctIndex: number,
  allKeywords: string[],
  count: number
): string[] {
  const distractors: string[] = [];
  const used = new Set<string>([correctAnswer.toLowerCase()]);

  // Strategy 1: Use other sentences as distractors
  for (let i = 0; i < sentences.length && distractors.length < count; i++) {
    if (i === correctIndex) continue;
    const candidate = sentences[i].text.length > 80
      ? sentences[i].text.slice(0, 77) + "..."
      : sentences[i].text;

    if (!used.has(candidate.toLowerCase())) {
      distractors.push(candidate);
      used.add(candidate.toLowerCase());
    }
  }

  // Strategy 2: If still not enough, use keyword combinations
  if (distractors.length < count) {
    const keywordPhrases = [
      "A process unrelated to the main topic",
      "A concept not discussed in the document",
      "None of the above applies in this context",
    ];
    for (
      let i = 0;
      i < keywordPhrases.length && distractors.length < count;
      i++
    ) {
      if (!used.has(keywordPhrases[i].toLowerCase())) {
        distractors.push(keywordPhrases[i]);
        used.add(keywordPhrases[i].toLowerCase());
      }
    }
  }

  return distractors.slice(0, count);
}

/** Generate poll questions (opinion-based, no correct answer) */
function generatePollQuestions(
  keywords: KeywordScore[],
  count: number
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];
  const usedKeywords = new Set<number>();

  const templates = [
    {
      title: (kw: string) =>
        `Which aspect of "${kw}" do you find most interesting?`,
      options: (kw: string) => [
        `The theoretical foundations of ${kw}`,
        `The practical applications of ${kw}`,
        `How ${kw} connects to other concepts`,
        `The future implications of ${kw}`,
      ],
    },
    {
      title: (kw: string) =>
        `How well do you understand the concept of "${kw}"?`,
      options: () => [
        "Very well — I can explain it to others",
        "Somewhat — I understand the basics",
        "A little — I need more examples",
        "Not at all — I need it explained again",
      ],
    },
    {
      title: (kw: string) =>
        `In your opinion, how important is "${kw}" in this subject?`,
      options: () => [
        "Extremely important — it's a core concept",
        "Important — good to know",
        "Somewhat important — useful context",
        "Not very important — minor detail",
      ],
    },
    {
      title: (kw: string) =>
        `Which learning method would help you best understand "${kw}"?`,
      options: () => [
        "Visual diagrams and flowcharts",
        "Real-world examples and case studies",
        "Hands-on practice and exercises",
        "Group discussion with classmates",
      ],
    },
    {
      title: (kw: string) =>
        `Where do you think "${kw}" is most applicable?`,
      options: (kw: string) => [
        "In research and academia",
        "In industry and professional settings",
        "In everyday life and decision making",
        "In future technological advancements",
      ],
    },
    {
      title: (kw: string) =>
        `What would you like to explore more about "${kw}"?`,
      options: () => [
        "More in-depth theory",
        "Practical projects and assignments",
        "Comparison with alternative approaches",
        "Latest developments and trends",
      ],
    },
  ];

  for (let i = 0; i < keywords.length && questions.length < count; i++) {
    if (usedKeywords.has(i)) continue;

    const kw = keywords[i];
    const template = templates[questions.length % templates.length];

    questions.push({
      type: "poll",
      title: template.title(kw.displayForm),
      options: template.options(kw.displayForm),
      correct_answer: null,
    });

    usedKeywords.add(i);
  }

  return questions;
}

/** Generate word cloud questions (open-ended, single word/phrase) */
function generateWordCloudQuestions(
  keywords: KeywordScore[],
  count: number
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];
  const usedKeywords = new Set<number>();

  const templates = [
    (kw: string) =>
      `Describe "${kw}" in one word or short phrase.`,
    (kw: string) =>
      `What comes to mind when you think of "${kw}"?`,
    (kw: string) =>
      `In one word, how would you summarize "${kw}"?`,
    (kw: string) =>
      `What is the most important aspect of "${kw}"? (one word)`,
    (kw: string) =>
      `If you had to teach "${kw}" to someone, what key word would you use?`,
    (kw: string) =>
      `What feeling or thought does "${kw}" evoke? (one word)`,
  ];

  for (let i = 0; i < keywords.length && questions.length < count; i++) {
    if (usedKeywords.has(i)) continue;

    const kw = keywords[i];
    const template = templates[questions.length % templates.length];

    questions.push({
      type: "wordcloud",
      title: template(kw.displayForm),
      options: [],
      correct_answer: null,
    });

    usedKeywords.add(i);
  }

  return questions;
}

// ─── Array Shuffle (Fisher-Yates) ─────────────────────────────────────────────

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Generate classroom questions from document text using rule-based analysis.
 * Runs entirely in the browser — no API keys, no downloads, no internet.
 *
 * @param text - The document text to generate questions from
 * @param count - Number of questions to generate
 * @param types - Array of question types to generate ("quiz", "poll", "wordcloud")
 * @returns Array of generated questions
 */
const GENERIC_BACKUPS: GeneratedQuestion[] = [
  {
    type: "quiz",
    title: "What is the primary topic of the document we just uploaded?",
    options: ["The core concepts and definitions", "Historical background and dates", "Practical implementation guides", "Future research opportunities"],
    correct_answer: "The core concepts and definitions"
  },
  {
    type: "poll",
    title: "How clear were the explanations in the uploaded document?",
    options: ["Extremely clear", "Moderately clear", "A bit confusing", "Not clear at all"],
    correct_answer: null
  },
  {
    type: "wordcloud",
    title: "Write down one key word that summarizes today's reading.",
    options: [],
    correct_answer: null
  },
  {
    type: "quiz",
    title: "Based on the text, which of the following is the most critical takeaway?",
    options: ["Understanding the foundational definitions", "Applying the concepts to practical examples", "Memorizing the key terminology", "Analyzing the relationships between concepts"],
    correct_answer: "Understanding the foundational definitions"
  },
  {
    type: "poll",
    title: "Which part of the material would you like to review in detail next class?",
    options: ["Basic terminology", "Advanced applications", "Practical code examples", "Theoretical proofs"],
    correct_answer: null
  },
  {
    type: "wordcloud",
    title: "What is one question you still have after reviewing this document?",
    options: [],
    correct_answer: null
  }
];

/**
 * Generate classroom questions from document text using rule-based analysis.
 * Runs entirely in the browser — no API keys, no downloads, no internet.
 *
 * @param text - The document text to generate questions from
 * @param count - Number of questions to generate
 * @param types - Array of question types to generate ("quiz", "poll", "wordcloud")
 * @returns Array of generated questions
 */
export function generateQuestionsLocally(
  text: string,
  count: number,
  types: QType[]
): GeneratedQuestion[] {
  // Step 1: Extract keywords from the document
  const keywords = extractKeywords(text, 30);

  // Step 2: Extract key sentences
  const keySentences = extractKeySentences(text, keywords, 20);

  // Step 3: Distribute question count evenly across requested types
  const perType = Math.ceil(count / types.length);
  const allQuestions: GeneratedQuestion[] = [];

  if (keywords.length >= 2) {
    for (const type of types) {
      const remaining = count - allQuestions.length;
      const toGenerate = Math.min(perType, remaining);
      if (toGenerate <= 0) break;

      switch (type) {
        case "quiz":
          allQuestions.push(
            ...generateQuizQuestions(keySentences, keywords, toGenerate)
          );
          break;
        case "poll":
          allQuestions.push(...generatePollQuestions(keywords, toGenerate));
          break;
        case "wordcloud":
          allQuestions.push(
            ...generateWordCloudQuestions(keywords, toGenerate)
          );
          break;
      }
    }
  }

  // If we couldn't generate enough from the text, fill remaining using keywords
  if (allQuestions.length < count && keywords.length > 0) {
    const extraPolls = generatePollQuestions(
      keywords,
      count - allQuestions.length
    );
    allQuestions.push(...extraPolls);
  }

  // If we STILL don't have enough (e.g. extremely short file), fill with high-quality generic backups
  let backupIdx = 0;
  while (allQuestions.length < count) {
    const backup = GENERIC_BACKUPS[backupIdx % GENERIC_BACKUPS.length];
    // Adapt type if requested
    const targetType = types[allQuestions.length % types.length];
    
    // Add backup question matching the target type
    const matchingBackup = GENERIC_BACKUPS.find(b => b.type === targetType) || backup;
    allQuestions.push({
      ...matchingBackup,
      title: matchingBackup.title
    });
    backupIdx++;
  }

  return allQuestions.slice(0, count);
}
