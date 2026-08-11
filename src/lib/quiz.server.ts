import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ==========================================
// 1. Zod Validation Schemas
// ==========================================

export const quizMetadataSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  start_datetime: z.string().min(1, "Start date and time is required"),
  end_datetime: z.string().min(1, "End date and time is required"),
  time_limit_minutes: z.preprocess(
    (val) => (val === "" || val === null ? null : Number(val)),
    z.number().min(1, "Time limit must be at least 1 minute").nullable().optional()
  ),
  shuffle_questions: z.boolean().default(false),
  shuffle_answers: z.boolean().default(false),
  max_attempts: z.preprocess(
    (val) => (val === "" || val === null ? 1 : Number(val)),
    z.number().min(1, "Attempts must be at least 1").default(1)
  ),
  pass_mark: z.preprocess(
    (val) => (val === "" || val === null ? null : Number(val)),
    z.number().min(0, "Pass mark must be non-negative").nullable().optional()
  ),
  target_audience: z.string().min(1, "Target audience (class/section) is required"),
});

export const questionRowSchema = z.object({
  question_no: z.coerce.number().optional().default(1),
  question_text: z.string().min(1, "Question Text is required"),
  option_a: z.string().min(1, "Option A is required"),
  option_b: z.string().min(1, "Option B is required"),
  option_c: z.string().nullable().optional(),
  option_d: z.string().nullable().optional(),
  option_e: z.string().nullable().optional(),
  correct_answer: z.string().min(1, "Correct Answer is required"),
  question_type: z.enum(["Single Correct", "Multiple Correct"], {
    errorMap: () => ({ message: "Question Type must be 'Single Correct' or 'Multiple Correct'" }),
  }),
  points: z.coerce.number().min(0, "Points must be non-negative").default(1),
  explanation: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  const correctAnswers = data.correct_answer.split(",").map(s => s.trim().toUpperCase());
  
  // Validate correct answer letters against existing options
  correctAnswers.forEach(ans => {
    if (!["A", "B", "C", "D", "E"].includes(ans)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct_answer"],
        message: `Correct Answer contains invalid option letter '${ans}'. Must be A, B, C, D, or E.`,
      });
      return;
    }
    if (ans === "C" && (!data.option_c || !data.option_c.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct_answer"],
        message: "Option C is referenced in Correct Answer but Option C is blank.",
      });
    }
    if (ans === "D" && (!data.option_d || !data.option_d.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct_answer"],
        message: "Option D is referenced in Correct Answer but Option D is blank.",
      });
    }
    if (ans === "E" && (!data.option_e || !data.option_e.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct_answer"],
        message: "Option E is referenced in Correct Answer but Option E is blank.",
      });
    }
  });

  // Validate type specific rules
  if (data.question_type === "Single Correct" && correctAnswers.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["correct_answer"],
      message: "For Single Correct questions, Correct Answer must contain exactly one letter (e.g. 'A').",
    });
  }
  if (data.question_type === "Multiple Correct" && correctAnswers.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["correct_answer"],
      message: "For Multiple Correct questions, Correct Answer must contain at least 2 comma-separated letters (e.g. 'A,C').",
    });
  }
});

// ==========================================
// 2. Excel Template Generation
// ==========================================

export const getTemplateUrl = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const XLSX = await import("xlsx");

    const bucket = "quiz-templates";
    const filename = "mcq-template.xlsx";

    // Check if template exists in storage
    const { data: files } = await supabaseAdmin.storage.from(bucket).list("", {
      search: filename,
    });

    const exists = files && files.some((f) => f.name === filename);

    if (!exists) {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Instructions
      const instructionsData = [
        ["MCQ Quiz Import Template - Instructions"],
        [],
        ["1. Do not modify the column headers in the 'Questions' sheet."],
        ["2. The 'Questions' sheet is where you enter your questions and options."],
        ["3. Required columns: Question Text, Option A, Option B, Correct Answer, Question Type."],
        ["4. Options C, D, and E are optional. Leave them blank if not needed."],
        ["5. Question Type must be exactly 'Single Correct' or 'Multiple Correct'."],
        ["6. Correct Answer must match the option letters (e.g., A, B, C, D, E)."],
        ["   - For Single Correct, enter a single letter: e.g. A"],
        ["   - For Multiple Correct, enter comma-separated letters: e.g. A,C,D"],
        ["7. Points must be a non-negative number (defaults to 1 if blank)."],
        ["8. Explanation is optional."],
      ];
      const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
      XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

      // Sheet 2: Questions
      const headers = [
        "Question No.",
        "Question Text",
        "Option A",
        "Option B",
        "Option C",
        "Option D",
        "Option E",
        "Correct Answer",
        "Question Type",
        "Points",
        "Explanation",
      ];
      const sampleData = [
        headers,
        [
          1,
          "What is the capital of Tamil Nadu?",
          "Chennai",
          "Coimbatore",
          "Madurai",
          "Salem",
          "",
          "A",
          "Single Correct",
          1,
          "Chennai is the capital city of Tamil Nadu.",
        ],
        [
          2,
          "Which of the following are programming languages? (Select all that apply)",
          "HTML",
          "Python",
          "CSS",
          "TypeScript",
          "SQL",
          "B,D,E",
          "Multiple Correct",
          2,
          "Python, TypeScript, and SQL are programming languages. HTML and CSS are markup/style sheet languages.",
        ],
      ];
      const wsQuestions = XLSX.utils.aoa_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(wb, wsQuestions, "Questions");

      // Sheet 3: Answer Key Summary
      const summaryData = [
        ["Answer Key Summary"],
        ["Please verify your answers against the questions list before uploading."],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Answer Key Summary");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const { error: uploadErr } = await supabaseAdmin.storage
        .from(bucket)
        .upload(filename, buf, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });

      if (uploadErr) {
        console.error("Error uploading generated template:", uploadErr);
        throw new Error("Failed to upload Excel template to storage");
      }
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(filename);
    return { url: publicUrl };
  });

// ==========================================
// 3. Excel Upload & Parse
// ==========================================

export const uploadAndParseQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: { fileBase64, metadata }, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const XLSX = await import("xlsx");

    // 1. Verify user role
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (roleError || !userRole || (userRole.role !== "faculty" && userRole.role !== "admin")) {
      throw new Error("Unauthorized: Only faculty members are authorized to create quizzes.");
    }

    // 2. Validate metadata
    const metaParsed = quizMetadataSchema.safeParse(metadata);
    if (!metaParsed.success) {
      throw new Error(`Invalid metadata: ${metaParsed.error.errors.map(e => e.message).join(", ")}`);
    }

    // 3. Decode base64 workbook
    const buffer = Buffer.from(fileBase64, "base64");
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch (err) {
      throw new Error("Invalid spreadsheet format. Could not parse file.");
    }

    const questionsSheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === "questions"
    );
    if (!questionsSheetName) {
      throw new Error("Invalid template: Sheet named 'Questions' was not found.");
    }

    const worksheet = workbook.Sheets[questionsSheetName];
    const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

    if (!jsonData || jsonData.length === 0) {
      throw new Error("The 'Questions' sheet is empty.");
    }

    // Trim headers and row strings
    const normalizedRows = jsonData.map((row: any) => {
      const normalized: any = {};
      Object.keys(row).forEach((key) => {
        normalized[key.trim()] = row[key];
      });
      return normalized;
    });

    // Filter out rows where "Question Text" is blank
    const activeRows = normalizedRows.filter((r) => {
      const text = r["Question Text"];
      return text !== undefined && text !== null && String(text).trim() !== "";
    });

    if (activeRows.length === 0) {
      throw new Error("No questions found (all rows had empty 'Question Text').");
    }

    if (activeRows.length > 200) {
      throw new Error("Upload exceeds maximum limit of 200 questions.");
    }

    const errors: { row: number; errors: string[] }[] = [];
    const validQuestions: z.infer<typeof questionRowSchema>[] = [];

    activeRows.forEach((r, idx) => {
      const excelRowNumber = idx + 2; // Data row starts after header row
      
      const parsedRow = questionRowSchema.safeParse({
        question_no: r["Question No."] !== undefined ? Number(r["Question No."]) : idx + 1,
        question_text: r["Question Text"] ? String(r["Question Text"]).trim() : "",
        option_a: r["Option A"] ? String(r["Option A"]).trim() : "",
        option_b: r["Option B"] ? String(r["Option B"]).trim() : "",
        option_c: r["Option C"] ? String(r["Option C"]).trim() : null,
        option_d: r["Option D"] ? String(r["Option D"]).trim() : null,
        option_e: r["Option E"] ? String(r["Option E"]).trim() : null,
        correct_answer: r["Correct Answer"] ? String(r["Correct Answer"]).trim().toUpperCase() : "",
        question_type: r["Question Type"] ? String(r["Question Type"]).trim() : "",
        points: r["Points"] !== undefined && r["Points"] !== "" ? Number(r["Points"]) : 1,
        explanation: r["Explanation"] ? String(r["Explanation"]).trim() : null,
      });

      if (!parsedRow.success) {
        errors.push({
          row: excelRowNumber,
          errors: parsedRow.error.issues.map((i) => i.message),
        });
      } else {
        validQuestions.push(parsedRow.data);
      }
    });

    // 4. Return validation report if errors exist
    if (errors.length > 0) {
      return { success: false, errors };
    }

    // 5. Generate unique quiz code (e.g. Q-KCT821)
    let quizCode = "Q-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    for (let i = 0; i < 5; i++) {
      const { data: codeCheck } = await supabaseAdmin
        .from("quizzes")
        .select("id")
        .eq("code", quizCode)
        .maybeSingle();
      if (!codeCheck) break;
      quizCode = "Q-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // 6. DB Transactional insertion using Supabase Admin Client
    // Insert quiz metadata
    const { data: quiz, error: quizError } = await supabaseAdmin
      .from("quizzes")
      .insert({
        title: metaParsed.data.title,
        description: metaParsed.data.description,
        code: quizCode,
        created_by: context.userId,
        start_datetime: metaParsed.data.start_datetime,
        end_datetime: metaParsed.data.end_datetime,
        time_limit_minutes: metaParsed.data.time_limit_minutes,
        shuffle_questions: metaParsed.data.shuffle_questions,
        shuffle_answers: metaParsed.data.shuffle_answers,
        max_attempts: metaParsed.data.max_attempts,
        pass_mark: metaParsed.data.pass_mark,
        target_audience: metaParsed.data.target_audience,
        source: "excel_upload",
      })
      .select("id")
      .single();

    if (quizError || !quiz) {
      console.error("Quiz creation error:", quizError);
      throw new Error(`Failed to create quiz: ${quizError?.message}`);
    }

    const quizId = quiz.id;

    // Insert all parsed questions linked to this quiz
    const questionsPayload = validQuestions.map((q) => ({
      quiz_id: quizId,
      question_no: q.question_no,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e,
      correct_answer: q.correct_answer,
      question_type: q.question_type,
      points: q.points,
      explanation: q.explanation,
    }));

    const { error: questionsError } = await supabaseAdmin
      .from("quiz_questions")
      .insert(questionsPayload);

    if (questionsError) {
      console.error("Quiz questions insertion error (rolling back):", questionsError);
      // Clean up orphaned quiz
      await supabaseAdmin.from("quizzes").delete().eq("id", quizId);
      throw new Error(`Failed to insert quiz questions: ${questionsError.message}`);
    }

    // 7. Upload the source Excel file to private Supabase Storage
    const storagePath = `${quizId}/source.xlsx`;
    const { error: fileUploadError } = await supabaseAdmin.storage
      .from("quiz-uploads")
      .upload(storagePath, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });

    if (fileUploadError) {
      console.warn("Audit file upload failed:", fileUploadError.message);
    } else {
      // Update quiz record with source URL
      await supabaseAdmin
        .from("quizzes")
        .update({ source_file_url: storagePath })
        .eq("id", quizId);
    }

    return { success: true, quizId, code: quizCode };
  });

// ==========================================
// 4. Create Quiz Manually Handler
// ==========================================

export const createQuizManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: { metadata, questions }, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Verify user role
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (roleError || !userRole || (userRole.role !== "faculty" && userRole.role !== "admin")) {
      throw new Error("Unauthorized: Only faculty members are authorized to create quizzes.");
    }

    // 2. Validate metadata
    const metaParsed = quizMetadataSchema.safeParse(metadata);
    if (!metaParsed.success) {
      throw new Error(`Invalid metadata: ${metaParsed.error.errors.map(e => e.message).join(", ")}`);
    }

    // 3. Validate questions
    if (!questions || questions.length === 0) {
      throw new Error("At least one question is required.");
    }

    const validQuestions: any[] = [];
    const errors: string[] = [];

    questions.forEach((q: any, idx: number) => {
      const parsed = questionRowSchema.safeParse({
        ...q,
        question_no: idx + 1,
      });
      if (!parsed.success) {
        errors.push(`Question ${idx + 1}: ${parsed.error.errors.map(e => e.message).join(", ")}`);
      } else {
        validQuestions.push(parsed.data);
      }
    });

    if (errors.length > 0) {
      throw new Error(errors.join(" | "));
    }

    // 4. Generate unique quiz code
    let quizCode = "Q-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    for (let i = 0; i < 5; i++) {
      const { data: codeCheck } = await supabaseAdmin
        .from("quizzes")
        .select("id")
        .eq("code", quizCode)
        .maybeSingle();
      if (!codeCheck) break;
      quizCode = "Q-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // 5. Insert quiz
    const { data: quiz, error: quizError } = await supabaseAdmin
      .from("quizzes")
      .insert({
        title: metaParsed.data.title,
        description: metaParsed.data.description,
        code: quizCode,
        created_by: context.userId,
        start_datetime: metaParsed.data.start_datetime,
        end_datetime: metaParsed.data.end_datetime,
        time_limit_minutes: metaParsed.data.time_limit_minutes,
        shuffle_questions: metaParsed.data.shuffle_questions,
        shuffle_answers: metaParsed.data.shuffle_answers,
        max_attempts: metaParsed.data.max_attempts,
        pass_mark: metaParsed.data.pass_mark,
        target_audience: metaParsed.data.target_audience,
        source: "manual",
      })
      .select("id")
      .single();

    if (quizError || !quiz) {
      console.error("Quiz creation error:", quizError);
      throw new Error(`Failed to create quiz: ${quizError?.message}`);
    }

    const quizId = quiz.id;

    // Insert questions
    const questionsPayload = validQuestions.map((q) => ({
      quiz_id: quizId,
      question_no: q.question_no,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e,
      correct_answer: q.correct_answer,
      question_type: q.question_type,
      points: q.points,
      explanation: q.explanation,
    }));

    const { error: questionsError } = await supabaseAdmin
      .from("quiz_questions")
      .insert(questionsPayload);

    if (questionsError) {
      // Clean up quiz
      await supabaseAdmin.from("quizzes").delete().eq("id", quizId);
      throw new Error(`Failed to insert quiz questions: ${questionsError.message}`);
    }

    return { success: true, quizId, code: quizCode };
  });
