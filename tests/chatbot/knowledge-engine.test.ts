import { describe, expect, test, spyOn } from "bun:test";
import { queryKnowledgeBase, searchKnowledge } from "../../src/lib/chatbot/knowledge-engine";
import { generateChatResponse } from "../../src/lib/ai-service";
import { ALL_KNOWLEDGE_ITEMS } from "../../src/data/chatbot/knowledge";

describe("KCT PULSE Local Knowledge Chatbot Engine", () => {
  // Test 0: Knowledge inventory completeness
  test("knowledge base contains all 16 domains and non-empty content", () => {
    expect(ALL_KNOWLEDGE_ITEMS.length).toBeGreaterThanOrEqual(16);
    for (const item of ALL_KNOWLEDGE_ITEMS) {
      expect(item.id).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.category).toBeDefined();
      expect(item.summary.length).toBeGreaterThan(20);
      expect(item.content.length).toBeGreaterThan(50);
      expect(item.keywords.length).toBeGreaterThanOrEqual(3);
    }
  });

  // Test 1: Exact keyword questions
  test("1. answers exact keyword questions correctly", () => {
    const r1 = queryKnowledgeBase("auto draft");
    expect(r1.confidence).toBeGreaterThan(0);
    expect(r1.answer).toContain("1-hour");
    expect(r1.sources.some((s) => s.id === "kb-auto-draft-policy")).toBe(true);

    const r2 = queryKnowledgeBase("word cloud");
    expect(r2.answer).toContain("Word Cloud");
    expect(r2.sources.some((s) => s.id === "kb-question-types")).toBe(true);
  });

  // Test 2: Natural-language questions
  test("2. answers natural-language questions with accurate source references", () => {
    const query = "How do students join a live classroom session?";
    const res = queryKnowledgeBase(query);
    expect(res.confidence).toBeGreaterThan(2.0);
    expect(res.answer).toContain("6-Character Shortcode");
    expect(res.answer).toContain("QR Code");
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.sources[0].title).toContain("Session Codes & Student Joining");
  });

  // Test 3: Different ways of asking the same question
  test("3. resolves different phrasing variants of the same question to the same source", () => {
    const v1 = queryKnowledgeBase("how do I embed into powerpoint");
    const v2 = queryKnowledgeBase("can I show live charts in google slides");
    const v3 = queryKnowledgeBase("slide presentation embed view iframe");

    expect(v1.sources.some((s) => s.id === "kb-presentation-embed")).toBe(true);
    expect(v2.sources.some((s) => s.id === "kb-presentation-embed")).toBe(true);
    expect(v3.sources.some((s) => s.id === "kb-presentation-embed")).toBe(true);
  });

  // Test 4: Questions spanning multiple knowledge sections
  test("4. answers questions combining multiple concepts (e.g. quizzes and exam integrity)", () => {
    const res = queryKnowledgeBase("quiz exam integrity anti-cheat");
    expect(res.answer).toContain("Integrity");
    expect(res.sources.some((s) => s.category === "Student" || s.category === "Questions")).toBe(
      true,
    );
  });

  // Test 5: Unsupported questions return the mandated fallback message
  test("5. returns the mandated fallback message for unsupported out-of-domain queries", () => {
    const res = queryKnowledgeBase("What is the recipe for chocolate cake?");
    expect(res.answer).toBe(
      "I couldn't find reliable information about that in the KCT PULSE knowledge base. Please contact the appropriate faculty or support team for assistance.",
    );
    expect(res.sources.length).toBe(0);
  });

  // Test 6: Empty queries
  test("6. handles empty, whitespace-only, and punctuation queries safely", () => {
    const r1 = queryKnowledgeBase("");
    const r2 = queryKnowledgeBase("   ");
    const r3 = queryKnowledgeBase("??? !!! ....");

    expect(r1.answer).toContain("I couldn't find reliable information");
    expect(r2.answer).toContain("I couldn't find reliable information");
    expect(r3.answer).toContain("I couldn't find reliable information");
  });

  // Test 7: Misspelled queries and suffixes
  test("7. handles common suffix variations and synonyms", () => {
    // Suffix reductions: quizzes -> quiz, embeddings -> embed
    const r1 = queryKnowledgeBase("quizzes");
    expect(r1.sources.some((s) => s.id === "kb-question-types")).toBe(true);

    const r2 = queryKnowledgeBase("embedding presentations");
    expect(r2.sources.some((s) => s.id === "kb-presentation-embed")).toBe(true);
  });

  // Test 8: Irrelevant knowledge matches are filtered out
  test("8. filters out irrelevant matches when confidence is too low", () => {
    const res = queryKnowledgeBase("asdfghjkl zxcvbnm qwertyuiop");
    expect(res.confidence).toBe(0);
    expect(res.answer).toContain("I couldn't find reliable information");
  });

  // Test 9: Follow-up questions leveraging prior conversation history
  test("9. resolves contextual follow-up questions using conversation history", () => {
    const history = [
      { role: "user" as const, content: "Tell me about Classroom Intelligence" },
      {
        role: "assistant" as const,
        content: "Classroom Intelligence provides concept accuracy and engagement scoring.",
      },
    ];

    // Follow-up query has no noun on its own ("how is it calculated?")
    const res = queryKnowledgeBase("how is it calculated", history);
    expect(res.confidence).toBeGreaterThan(1.5);
    expect(res.answer).toContain("Engagement");
  });

  // Test 10: ZERO external network or API calls during chatbot operation
  test("10. operates 100% locally with zero external network fetch calls", async () => {
    const globalFetch = globalThis.fetch;
    let fetchCalled = false;

    // Spy on global fetch
    globalThis.fetch = ((...args: any[]) => {
      fetchCalled = true;
      throw new Error(`Unauthorized external fetch attempt: ${args[0]}`);
    }) as any;

    try {
      const response = await generateChatResponse([
        { role: "user", content: "Who built KCT PULSE and who is the founder?" },
      ]);

      expect(fetchCalled).toBe(false);
      expect(response).toContain("Tharun N E");
      expect(response).toContain("Navneeth V");
    } finally {
      globalThis.fetch = globalFetch;
    }
  });
});
