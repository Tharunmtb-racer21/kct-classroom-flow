/**
 * answer-evaluator.ts
 * Robust, deterministic answer evaluation engine for KCT PULSE.
 *
 * Provides accurate, explainable answer verification for quiz responses:
 * - Single-choice: case-insensitive, whitespace-trimmed, and prefix-normalized matching.
 * - Multiple-choice: permutation-invariant set comparison for comma-separated responses.
 * - Option label normalization: handles "A. Text", "A) Text", "(A) Text", and letter index matching.
 */

/**
 * Normalizes an individual answer token by trimming, converting to lower case,
 * and stripping standard question prefixes such as "A.", "B)", "(C)", "1.", etc.
 */
export function normalizeAnswerToken(token: string): string {
  if (!token) return "";
  let clean = token.trim().toLowerCase();
  // Strip leading option markers like "a.", "a)", "(a)", "1.", "1)", etc.
  clean = clean.replace(/^(\(?[a-z0-9][\.\)\:\-]\s*)/i, "").trim();
  return clean;
}

/**
 * Splits a comma-separated answer string into a set of normalized tokens.
 */
function extractTokenSet(answer: string): Set<string> {
  const tokens = answer
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return new Set(tokens);
}

/**
 * Splits a comma-separated answer string into a set of prefix-stripped tokens.
 */
function extractNormalizedTokenSet(answer: string): Set<string> {
  const tokens = answer
    .split(",")
    .map((t) => normalizeAnswerToken(t))
    .filter(Boolean);
  return new Set(tokens);
}

/**
 * Determines whether two sets of strings are identical.
 */
function areSetsEqual(setA: Set<string>, setB: Set<string>): boolean {
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

/**
 * Evaluates whether a student's answer is correct compared to the question's correct answer.
 *
 * @param studentAnswer The submitted answer string from the student
 * @param correctAnswer The authoritative correct answer string configured for the question
 * @param options Optional list of question options to resolve letter index matches (e.g. "A" -> options[0])
 * @returns boolean indicating whether the answer is evaluated as correct
 */
export function isAnswerCorrect(
  studentAnswer: string | null | undefined,
  correctAnswer: string | null | undefined,
  options?: any[] | any,
): boolean {
  if (!studentAnswer || !correctAnswer) return false;

  const sRaw = studentAnswer.trim();
  const cRaw = correctAnswer.trim();

  if (!sRaw || !cRaw) return false;

  // 1. Exact match (case-insensitive, trimmed)
  const sLower = sRaw.toLowerCase();
  const cLower = cRaw.toLowerCase();
  if (sLower === cLower) return true;

  // 2. Single-item prefix normalization (e.g. "A. Nitrogen" vs "Nitrogen", "B) Text" vs "Text")
  const sNorm = normalizeAnswerToken(sLower);
  const cNorm = normalizeAnswerToken(cLower);
  if (sNorm && cNorm && sNorm === cNorm) return true;

  // 3. Option-aware single-choice vs multiple-choice distinction
  // If options array is provided, check if both studentAnswer and correctAnswer
  // correspond to distinct individual choices in the question's options list.
  // When both are individual options (e.g. sequence/ordering questions whose options contain commas),
  // comma-delimited set comparison must NOT be performed so distinct distractor options are rejected.
  const hasOptions = Array.isArray(options) && options.length > 0;
  const strOptions = hasOptions
    ? options.map((o: any) =>
        typeof o === "string" ? o.trim().toLowerCase() : String(o ?? "").trim().toLowerCase(),
      )
    : [];
  const normOptions = strOptions.map((o) => normalizeAnswerToken(o));

  const sIsIndividualOption =
    strOptions.includes(sLower) || (Boolean(sNorm) && normOptions.includes(sNorm));
  const cIsIndividualOption =
    strOptions.includes(cLower) || (Boolean(cNorm) && normOptions.includes(cNorm));

  const isBothSingleOptions = sIsIndividualOption && cIsIndividualOption;

  // 4. Comma-separated multiple-choice set match (permutation invariant)
  // Only performed when not a collision of two distinct single options.
  if (!isBothSingleOptions && (sLower.includes(",") || cLower.includes(","))) {
    const sTokens = extractTokenSet(sLower);
    const cTokens = extractTokenSet(cLower);
    if (areSetsEqual(sTokens, cTokens)) return true;

    // Check with normalized tokens (stripping prefixes like "A.", "B.")
    const sNormTokens = extractNormalizedTokenSet(sLower);
    const cNormTokens = extractNormalizedTokenSet(cLower);
    if (areSetsEqual(sNormTokens, cNormTokens)) return true;
  }

  // 5. Letter index matching against options (e.g. student answered "A" and correct is options[0])
  if (hasOptions) {
    const optionLetters = ["a", "b", "c", "d", "e", "f"];

    // Check if correctAnswer is a single letter (e.g. "A") and studentAnswer matches the option text
    const cLetterIdx = optionLetters.indexOf(cLower);
    if (cLetterIdx >= 0 && strOptions[cLetterIdx]) {
      const targetOpt = strOptions[cLetterIdx];
      if (sLower === targetOpt || sNorm === normOptions[cLetterIdx]) {
        return true;
      }
    }

    // Check if studentAnswer is a single letter (e.g. "B") and correctAnswer matches the option text
    const sLetterIdx = optionLetters.indexOf(sLower);
    if (sLetterIdx >= 0 && strOptions[sLetterIdx]) {
      const targetOpt = strOptions[sLetterIdx];
      if (cLower === targetOpt || cNorm === normOptions[sLetterIdx]) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Result of question difficulty and observed performance evaluation.
 */
export interface QuestionObservedPerformance {
  questionId: string;
  title: string;
  type: string;
  correctAnswer: string | null;
  submittedCount: number;
  correctCount: number;
  observedAccuracy: number; // 0 - 100 percentage
  observedErrorRate: number; // 0 - 100 percentage
  totalParticipantsInSession: number;
  responseCoveragePercentage: number; // 0 - 100 percentage (submitted / eligible session participants)
  sampleSufficiency: "insufficient" | "preliminary" | "reliable";
  sampleSufficiencyLabel: string;
  hasSufficientSample: boolean;
}

/**
 * Evaluates observed descriptive performance for a single quiz question.
 *
 * Thresholds:
 * - N < 5: Insufficient sample (too few responses to evaluate observed difficulty)
 * - 5 <= N < 15: Preliminary sample (early trend observed)
 * - N >= 15: Reliable sample
 */
export function calculateQuestionObservedPerformance(
  question: {
    id: string;
    title: string;
    type: string;
    correct_answer: string | null;
    options?: any[] | any;
  },
  responses: Array<{ answer: string }>,
  totalParticipantsInSession: number,
): QuestionObservedPerformance {
  const submittedCount = responses.length;
  let correctCount = 0;

  if (question.type === "quiz" && question.correct_answer) {
    for (const r of responses) {
      if (isAnswerCorrect(r.answer, question.correct_answer, question.options)) {
        correctCount += 1;
      }
    }
  }

  const observedAccuracy =
    submittedCount > 0 ? Math.round((correctCount / submittedCount) * 100) : 0;
  const observedErrorRate =
    submittedCount > 0 ? 100 - observedAccuracy : 0;

  const eligibleParticipants = Math.max(submittedCount, totalParticipantsInSession);
  const responseCoveragePercentage =
    eligibleParticipants > 0
      ? Math.min(100, Math.round((submittedCount / eligibleParticipants) * 100))
      : 0;

  let sampleSufficiency: "insufficient" | "preliminary" | "reliable" = "insufficient";
  let sampleSufficiencyLabel = "Insufficient Data (N < 5)";
  let hasSufficientSample = false;

  if (submittedCount >= 15) {
    sampleSufficiency = "reliable";
    sampleSufficiencyLabel = "Reliable Sample (N ≥ 15)";
    hasSufficientSample = true;
  } else if (submittedCount >= 5) {
    sampleSufficiency = "preliminary";
    sampleSufficiencyLabel = "Preliminary Sample (N: 5–14)";
    hasSufficientSample = true;
  }

  return {
    questionId: question.id,
    title: question.title,
    type: question.type,
    correctAnswer: question.correct_answer,
    submittedCount,
    correctCount,
    observedAccuracy,
    observedErrorRate,
    totalParticipantsInSession,
    responseCoveragePercentage,
    sampleSufficiency,
    sampleSufficiencyLabel,
    hasSufficientSample,
  };
}
