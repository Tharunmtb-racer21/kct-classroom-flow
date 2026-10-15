/**
 * feedback-server.ts
 * TanStack Start server function for feedback submissions.
 *
 * This module is imported by browser code, which receives only the RPC stub.
 * All logic, database interaction, and Web3Forms delivery execute server-side in
 * `feedback-handler.server.ts`. The server-only provider credential `WEB3FORMS_ACCESS_KEY`
 * never reaches the client bundle.
 */

import { createServerFn } from "@tanstack/react-start";
import type { FeedbackSubmissionInput, FeedbackSubmissionOutput } from "./feedback-handler.server";

export const submitFeedbackServerFn = createServerFn({ method: "POST" })
  .validator((data: FeedbackSubmissionInput) => data)
  .handler(async ({ data }): Promise<FeedbackSubmissionOutput> => {
    const [{ getRequestHeader, setResponseStatus }, handlerModule] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("./feedback-handler.server"),
    ]);

    try {
      const headers = {
        get: (name: string) => getRequestHeader(name),
      };
      return await handlerModule.handleFeedbackSubmission(data, headers);
    } catch (err) {
      if (err instanceof handlerModule.FeedbackSubmissionError) {
        setResponseStatus(err.status);
        throw err;
      }
      console.error("[Feedback] Submission handler unexpected failure:", err);
      setResponseStatus(500);
      throw new Error("Failed to process feedback submission.");
    }
  });
