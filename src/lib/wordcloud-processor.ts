/**
 * Centralized Word Cloud Text Preprocessing & Frequency Engine
 * 
 * Pipeline:
 * Raw student answers -> Extract text -> Tokenize -> Strip punctuation/noise
 * -> Filter single-char/numeric noise -> Filter English stopwords
 * -> Preserve valid technical acronyms & domain terms (AI, CPU, RAM, OS, GPU, etc.)
 * -> Normalize words consistently to lowercase while keeping technical acronyms uppercase
 * -> Aggregate frequencies across variations (Memory, memory, MEMORY! -> memory: 3)
 * -> Return sorted [displayWord, frequency] pairs.
 */

export const DEFAULT_STOPWORDS = new Set<string>([
  // Articles
  "a", "an", "the",
  
  // Conjunctions & Prepositions
  "and", "or", "but", "nor", "so", "yet", "for", "if", "then", "than",
  "because", "as", "until", "while", "of", "at", "by", "with",
  "about", "against", "between", "into", "through", "during", "before",
  "after", "above", "below", "to", "from", "up", "down", "in", "out",
  "on", "off", "over", "under", "again", "further", "once",
  "both", "each", "few", "more", "most", "other", "some", "such",
  
  // Pronouns
  "i", "me", "my", "myself", "we", "us", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself", "she", "her", "hers", "herself",
  "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
  "what", "which", "who", "whom", "this", "that", "these", "those",
  "whose",
  
  // Auxiliary & Common Verbs
  "am", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "having",
  "do", "does", "did", "doing",
  "would", "should", "could", "ought",
  "can", "cannot", "will", "may", "might", "must", "shall",
  
  // Contractions (with and without apostrophe)
  "i'm", "im", "you're", "youre", "he's", "hes", "she's", "shes",
  "it's", "its", "we're", "were", "they're", "theyre",
  "i've", "ive", "you've", "youve", "we've", "weve", "they've", "theyve",
  "i'd", "id", "you'd", "youd", "he'd", "hed", "she'd", "shed", "we'd", "wed", "they'd", "theyd",
  "i'll", "ill", "you'll", "youll", "he'll", "hell", "she'll", "shell", "we'll", "well", "they'll", "theyll",
  "isn't", "isnt", "aren't", "arent", "wasn't", "wasnt", "weren't", "werent",
  "hasn't", "hasnt", "haven't", "havent", "hadn't", "hadnt",
  "doesn't", "doesnt", "don't", "dont", "didn't", "didnt",
  "won't", "wont", "wouldn't", "wouldnt", "shouldn't", "shouldnt", "can't", "cant", "couldn't", "couldnt",
  "mustn't", "mustnt", "let's", "lets", "that's", "thats", "who's", "whos", "what's", "whats",
  "here's", "heres", "there's", "theres", "when's", "whens", "where's", "wheres", "why's", "whys", "how's", "hows",
  
  // Adverbs & Common fillers
  "here", "there", "when", "where", "why", "how", "all", "any",
  "no", "not", "only", "own", "same", "too", "very", "just",
  "also", "now", "always", "never", "sometimes", "often", "already",
  "still", "yes", "yeah", "yep", "nope", "ok", "okay", "etc", "eg", "ie",
  "like", "even", "really", "much", "many", "back", "away"
]);

/**
 * Standard Computer Science & Engineering acronyms that should always be displayed in uppercase
 */
export const KNOWN_TECHNICAL_ACRONYMS = new Set<string>([
  "AI", "ML", "DL", "NLP", "LLM", "CV",
  "CPU", "GPU", "TPU", "RAM", "ROM", "SSD", "HDD", "ALU", "CU",
  "OS", "DB", "DBMS", "RDBMS", "SQL", "NOSQL",
  "IP", "TCP", "UDP", "HTTP", "HTTPS", "FTP", "DNS", "DHCP", "SSH", "SSL", "TLS",
  "LAN", "WAN", "MAN", "WLAN", "PAN", "VPN",
  "UI", "UX", "GUI", "CLI", "API", "SDK", "REST", "JSON", "XML", "HTML", "CSS", "JS", "TS",
  "IDE", "VCS", "CI", "CD", "IOT", "RFID", "NFC", "AWS", "GCP",
  "OOP", "DSA", "BFS", "DFS", "DAG", "FIFO", "LIFO", "LRU"
]);

/**
 * Validates and cleans a raw token.
 * Returns null if token is empty, numeric, single-char noise, or in stopword list.
 */
export function cleanAndValidateToken(
  rawToken: string,
  stopWords: Set<string> = DEFAULT_STOPWORDS
): { key: string; display: string } | null {
  if (!rawToken) return null;

  // Trim and strip leading/trailing non-alphanumeric punctuation while preserving internal hyphens
  const stripped = rawToken.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  if (!stripped) return null;

  // Remove single-character noise (length < 2)
  if (stripped.length < 2) return null;

  // Remove pure numbers without semantic letters (e.g., "1", "100", "2024")
  if (/^\d+$/.test(stripped)) return null;

  const key = stripped.toLowerCase();

  // Filter out stopwords
  if (stopWords.has(key)) return null;

  // Determine display format:
  // Acronyms (like AI, CPU, RAM, OS) remain uppercase.
  // Standard English words normalize to lowercase for uniform aggregation.
  const upperKey = key.toUpperCase();
  let display = key;
  if (KNOWN_TECHNICAL_ACRONYMS.has(upperKey) || (stripped === upperKey && stripped.length <= 4)) {
    display = upperKey;
  }

  return { key, display };
}

export interface WordCloudProcessOptions {
  questionId?: string;
  maxWords?: number;
  customStopwords?: Set<string>;
}

/**
 * Processes an array of response objects into frequency-weighted word pairs.
 * 
 * - Strictly isolates responses by questionId if specified.
 * - Extracts, tokenizes, and strips punctuation.
 * - Filters common function words (it, that, is, the, etc.) while keeping technical short words (AI, CPU, RAM, OS).
 * - Aggregates frequencies across variations (Memory, memory, MEMORY! -> memory: 3).
 * - Returns [word, count] tuples sorted descending by count.
 */
export function processWordCloudResponses(
  responses: Array<{ answer?: string | null; question_id?: string }>,
  options?: WordCloudProcessOptions
): Array<[string, number]> {
  const { questionId, maxWords = 200, customStopwords = DEFAULT_STOPWORDS } = options || {};

  const counts = new Map<string, { count: number; display: string }>();

  for (const r of responses) {
    // Question-specific isolation: ignore responses not matching target question
    if (questionId && r.question_id && r.question_id !== questionId) {
      continue;
    }

    if (!r.answer || typeof r.answer !== "string") {
      continue;
    }

    // Split answer into tokens using spaces, commas, quotes, brackets, and punctuation delimiters
    const rawTokens = r.answer.split(/[\s,;!?:()[\]{}<>"'“”‘’`~\\/|^+=*&%#@$]+/u);

    for (const rawToken of rawTokens) {
      const tokenInfo = cleanAndValidateToken(rawToken, customStopwords);
      if (!tokenInfo) continue;

      const { key, display } = tokenInfo;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        // Prioritize uppercase display if an acronym is detected
        if (display === key.toUpperCase() && existing.display !== display) {
          existing.display = display;
        }
      } else {
        counts.set(key, { count: 1, display });
      }
    }
  }

  const entries: Array<[string, number]> = [];

  for (const meta of counts.values()) {
    entries.push([meta.display, meta.count]);
  }

  // Sort descending by count, with alphabetical secondary sort for determinism
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return entries.slice(0, maxWords);
}
