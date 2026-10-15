/**
 * ai-server.ts
 * TanStack Start server functions for every AI feature.
 *
 * This module is imported by browser code, which receives only RPC stubs. All logic
 * lives in server-only modules that are loaded inside the handlers. Provider
 * credentials exist only in server environment variables (see ai-providers.server.ts).
 *
 * The browser attaches the caller's Firebase ID token as a bearer token through the
 * global attachSupabaseAuth function middleware registered in src/start.ts.
 */

import { createServerFn } from "@tanstack/react-start";
import type {
  AiKeyDiagnosticResult,
  AiKeyInventory,
  AiKeyTestInput,
  ChatInput,
  ChatResult,
  GenerateQuestionsInput,
  GenerateQuestionsResult,
  IntegritySummaryInput,
  IntegritySummaryResult,
} from "./ai-schemas";

type HandlerName =
  | "handleGenerateQuestions"
  | "handleChat"
  | "handleIntegritySummary"
  | "handleAiKeyInventory"
  | "handleAiKeyTest";

/** Runs a server-only handler with the request's Authorization header and maps errors to safe responses. */
async function runAiHandler<T>(name: HandlerName, data: unknown): Promise<T> {
  const [{ getRequestHeader, setResponseStatus }, handlers] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("./ai-handlers.server"),
  ]);
  try {
    const handler = handlers[name] as (auth: string | undefined, input: unknown) => Promise<T>;
    return await handler(getRequestHeader("authorization"), data);
  } catch (err) {
    if (err instanceof handlers.AiRequestError) {
      setResponseStatus(err.status);
      throw new Error(err.message);
    }
    console.error(`[AI] ${name} failed unexpectedly`);
    setResponseStatus(500);
    throw new Error("AI request failed.");
  }
}

/** Generate classroom questions from document text. Requires a verified @kct.ac.in account. */
export const generateQuestionsServerFn = createServerFn({ method: "POST" })
  .validator((data: GenerateQuestionsInput) => data)
  .handler(({ data }) => runAiHandler<GenerateQuestionsResult>("handleGenerateQuestions", data));

/** Chat reply for the dashboard assistant. Requires a verified @kct.ac.in account. */
export const generateChatServerFn = createServerFn({ method: "POST" })
  .validator((data: ChatInput) => data)
  .handler(({ data }) => runAiHandler<ChatResult>("handleChat", data));

/** Proctoring summary for one student's integrity events. Requires a verified @kct.ac.in account. */
export const generateIntegritySummaryServerFn = createServerFn({ method: "POST" })
  .validator((data: IntegritySummaryInput) => data)
  .handler(({ data }) => runAiHandler<IntegritySummaryResult>("handleIntegritySummary", data));

/** Number of configured key slots per provider. Requires the admin role. */
export const getAiKeyInventoryServerFn = createServerFn({ method: "POST" }).handler(() =>
  runAiHandler<AiKeyInventory>("handleAiKeyInventory", undefined),
);

/** Health check for one configured key slot. Requires the admin role. */
export const testAiKeyServerFn = createServerFn({ method: "POST" })
  .validator((data: AiKeyTestInput) => data)
  .handler(({ data }) => runAiHandler<AiKeyDiagnosticResult>("handleAiKeyTest", data));
