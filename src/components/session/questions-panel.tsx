import { useState, useMemo, useEffect } from "react";
import {
  Play,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Image as ImageIcon,
  Pencil,
  Award,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { VoiceInputButton } from "@/components/voice-input-button";
import { AIGenerateDialog } from "./ai-generate-dialog";
import type { Session, Question, QType } from "@/types/session.types";

export function QuestionsPanel({
  session,
  sessionId,
  questions,
  currentId,
  isAllMode,
  activeQuestionIds,
  onActivate,
  onReload,
  updateSession,
}: {
  session: Session;
  sessionId: string;
  questions: Question[];
  currentId: string | null;
  isAllMode: boolean;
  activeQuestionIds: string[];
  onActivate: (id: string) => void;
  onReload: () => void;
  updateSession: (patch: Partial<Session>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<QType>("poll");
  const [title, setTitle] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [questionType, setQuestionType] = useState<string>("Single Correct");
  const parsedOptions = useMemo(() => {
    return optionsText
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
  }, [optionsText]);
  const [correct, setCorrect] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [marks, setMarks] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Excel upload/parsing states for Quiz import
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelParsingErrors, setExcelParsingErrors] = useState<string[]>([]);
  const [excelValidated, setExcelValidated] = useState(false);
  const [excelQuestions, setExcelQuestions] = useState<any[]>([]);

  const [isRetakeConfirmOpen, setIsRetakeConfirmOpen] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);

  const handleDownloadTemplate = () => {
    (async () => {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // Sheet 1: Instructions
      const instructionsData = [
        ["", "MCQ Quiz Upload Template"],
        ["", "Fill in the 'Questions' sheet, then upload this file to create your quiz."],
        [],
        ["", "How to use this template"],
        ["", '1. Open the "Questions" sheet (second tab at the bottom).'],
        [
          "",
          "2. Row 2 is a filled-in EXAMPLE (shaded green). Do not delete the header row (row 1). You may delete the example row",
        ],
        ["", "   before uploading, or leave it — it will be ignored if you follow the format."],
        [
          "",
          "3. Add one question per row, starting from row 2 (or row 3 if you kept the example).",
        ],
        [
          "",
          "4. Fill in Option A and Option B at minimum. Option C, D and E are optional — leave blank if not needed.",
        ],
        [
          "",
          '5. In the "Correct Answer" column, enter the letter of the correct option (A, B, C, D, or E).',
        ],
        ["", '6. "Points" is the score awarded for a correct answer. Defaults to 1 if left blank.'],
        [
          "",
          '7. "Question Type" should be Single Correct or Multiple Correct. For Multiple Correct questions, list all',
        ],
        ["", '   correct letters separated by commas in "Correct Answer" (e.g. A,C).'],
        [
          "",
          '8. "Explanation" is optional and shown to the user after answering (if your portal supports it).',
        ],
        [
          "",
          "9. Do not rename column headers, do not reorder columns, and do not add extra columns — the upload parser depends on this exact layout.",
        ],
        ["", "10. Save the file as .xlsx and upload it back to the portal."],
        [],
        ["", "Formatting legend"],
        ["", "Cells you fill in (light yellow/beige)"],
        ["", "Example row (light green)"],
        [],
        ["", "Column reference"],
        ["", "• Question No: Auto-numbered. Do not edit — formula fills this automatically."],
        ["", "• Question Text: The question shown to the quiz taker. Required."],
        ["", "• Option A: First answer choice. Required."],
        ["", "• Option B: Second answer choice. Required."],
        ["", "• Option C: Third answer choice. Optional."],
        ["", "• Option D: Fourth answer choice. Optional."],
        ["", "• Option E: Fifth answer choice. Optional."],
        ["", "• Correct Answer: Letter of the correct option, e.g., 'A' or 'B'."],
        ["", "• Question Type: Single Correct or Multiple Correct."],
        ["", "• Points: Score for a correct answer. Defaults to 0 if blank."],
        ["", "• Explanation: Optional. Shown after the question is answered."],
      ];
      const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
      wsInstructions["!cols"] = [{ wch: 3 }, { wch: 110 }];
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
          "What is the capital of France?",
          "Paris",
          "Berlin",
          "London",
          "Rome",
          "",
          "A",
          "Single Correct",
          1,
          "Paris has been the capital of France since the 16th century.",
        ],
      ];
      const wsQuestions = XLSX.utils.aoa_to_sheet(sampleData);
      wsQuestions["!cols"] = [
        { wch: 12 },
        { wch: 45 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 15 },
        { wch: 15 },
        { wch: 10 },
        { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, wsQuestions, "Questions");

      // Sheet 3: Answer Key Summary
      const summaryHeaders = [
        "Question No.",
        "Question Text",
        "Correct Answer",
        "Question Type",
        "Points",
      ];
      const summaryData = [
        ["Answer Key Summary"],
        ["Auto-generated from the Questions sheet. This is for your review only — do not edit."],
        [],
        summaryHeaders,
        [1, "What is the capital of France?", "A", "Single Correct", 1],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary["!cols"] = [{ wch: 12 }, { wch: 45 }, { wch: 15 }, { wch: 15 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "Answer Key Summary");

      XLSX.writeFile(wb, "mcq_quiz_upload_template.xlsx");
    })();
  };

  const handleValidateExcel = () => {
    if (!excelFile) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx");
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        const questionsSheetName = workbook.SheetNames.find(
          (name) => name.toLowerCase() === "questions",
        );
        if (!questionsSheetName) {
          setExcelParsingErrors(["Sheet named 'Questions' was not found in the Excel template."]);
          setExcelValidated(false);
          return;
        }

        const worksheet = workbook.Sheets[questionsSheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        if (!jsonData || jsonData.length === 0) {
          setExcelParsingErrors(["The 'Questions' sheet is empty."]);
          setExcelValidated(false);
          return;
        }

        const normalizedRows = jsonData.map((row: any) => {
          const normalized: any = {};
          Object.keys(row).forEach((key) => {
            normalized[key.trim()] = row[key];
          });
          return normalized;
        });

        // Filter out example rows or empty question texts
        const activeRows = normalizedRows.filter((r) => {
          const text = r["Question Text"];
          return text !== undefined && text !== null && String(text).trim() !== "";
        });

        if (activeRows.length === 0) {
          setExcelParsingErrors(["No questions found (all rows had empty 'Question Text')."]);
          setExcelValidated(false);
          return;
        }

        const errorsList: string[] = [];
        const parsedQuestionsList: any[] = [];

        activeRows.forEach((r, idx) => {
          const rowNum = idx + 2;
          const qText = r["Question Text"] ? String(r["Question Text"]).trim() : "";
          const optA = r["Option A"] ? String(r["Option A"]).trim() : "";
          const optB = r["Option B"] ? String(r["Option B"]).trim() : "";
          const optC = r["Option C"] ? String(r["Option C"]).trim() : "";
          const optD = r["Option D"] ? String(r["Option D"]).trim() : "";
          const optE = r["Option E"] ? String(r["Option E"]).trim() : "";
          const correctAnsRaw = r["Correct Answer"] ? String(r["Correct Answer"]).trim() : "";
          const qTypeRaw = r["Question Type"] ? String(r["Question Type"]).trim() : "";
          const pointsRaw = r["Points"] ?? r["Marks"];
          const explanation = r["Explanation"] ? String(r["Explanation"]).trim() : "";

          if (!qText) {
            errorsList.push(`Row ${rowNum}: Question Text is required.`);
          }
          if (!optA || !optB) {
            errorsList.push(`Row ${rowNum}: Option A and Option B are required.`);
          }

          const optionsMap: Record<string, string> = {
            A: optA,
            B: optB,
            C: optC,
            D: optD,
            E: optE,
          };
          const optionsList = [optA, optB, optC, optD, optE].filter(Boolean);
          if (optionsList.length < 2) {
            errorsList.push(`Row ${rowNum}: At least 2 options are required.`);
          }

          if (qTypeRaw !== "Single Correct" && qTypeRaw !== "Multiple Correct") {
            errorsList.push(
              `Row ${rowNum}: Question Type must be exactly 'Single Correct' or 'Multiple Correct'. Got '${qTypeRaw}'.`,
            );
          }

          let points = 0;
          if (pointsRaw !== undefined && pointsRaw !== null && String(pointsRaw).trim() !== "") {
            const parsedPoints = Number(pointsRaw);
            if (isNaN(parsedPoints) || parsedPoints < 0 || !Number.isInteger(parsedPoints)) {
              errorsList.push(
                `Row ${rowNum}: Points/Marks must be a non-negative whole number. Got '${pointsRaw}'.`,
              );
            } else {
              points = parsedPoints;
            }
          }

          if (!correctAnsRaw) {
            errorsList.push(`Row ${rowNum}: Correct Answer is required.`);
          } else {
            // Split correct answer by commas to support multiple choices (e.g. A,C or B,D)
            const letters = correctAnsRaw
              .split(",")
              .map((l) => l.trim().toUpperCase())
              .filter(Boolean);

            if (qTypeRaw === "Single Correct" && letters.length !== 1) {
              errorsList.push(
                `Row ${rowNum}: For Single Correct questions, Correct Answer must be exactly one letter. Got '${correctAnsRaw}'.`,
              );
            } else if (qTypeRaw === "Multiple Correct" && letters.length < 2) {
              errorsList.push(
                `Row ${rowNum}: For Multiple Correct questions, Correct Answer must contain 2+ comma-separated valid letters. Got '${correctAnsRaw}'.`,
              );
            }

            const invalidLetters = letters.filter((l) => !["A", "B", "C", "D", "E"].includes(l));
            if (invalidLetters.length > 0) {
              errorsList.push(
                `Row ${rowNum}: Correct Answer contains invalid option letters: ${invalidLetters.join(", ")}.`,
              );
            } else {
              const emptyOptionLetters = letters.filter((l) => !optionsMap[l]);
              if (emptyOptionLetters.length > 0) {
                errorsList.push(
                  `Row ${rowNum}: Correct Answer references empty option(s): ${emptyOptionLetters.join(", ")}.`,
                );
              }
            }

            if (errorsList.length === 0) {
              const correctAnswers = letters.map((l) => optionsMap[l]);
              const correct_answer_str = correctAnswers.join(", ");

              parsedQuestionsList.push({
                title: qText,
                options: optionsList,
                correct_answer: correct_answer_str,
                question_type: qTypeRaw,
                points,
                explanation,
              });
            }
          }
        });

        if (errorsList.length > 0) {
          setExcelParsingErrors(errorsList);
          setExcelValidated(false);
          setExcelQuestions([]);
        } else {
          setExcelParsingErrors([]);
          setExcelValidated(true);
          setExcelQuestions(parsedQuestionsList);
          toast.success("Excel template validation successful!");
        }
      } catch (err: any) {
        setExcelParsingErrors([err.message || "Failed to parse file."]);
        setExcelValidated(false);
        setExcelQuestions([]);
      }
    };
    reader.readAsArrayBuffer(excelFile);
  };

  const handleImportExcelQuestions = async () => {
    if (!excelValidated || excelQuestions.length === 0) {
      toast.error("Please validate the Excel template successfully first.");
      return;
    }

    setSaving(true);
    try {
      const questionsPayload = excelQuestions.map((q, idx) => ({
        session_id: sessionId,
        type: "quiz" as const,
        title: q.title,
        options: q.options,
        correct_answer: q.correct_answer,
        order_index: questions.length + idx,
        points: q.marks ?? q.points ?? 0,
        marks: q.marks ?? q.points ?? 0,
        explanation: q.explanation,
        question_type: q.question_type,
      }));

      const { error } = await supabase.from("questions").insert(questionsPayload);
      if (error) throw error;

      toast.success(`${excelQuestions.length} questions imported successfully!`);

      setExcelFile(null);
      setExcelParsingErrors([]);
      setExcelValidated(false);
      setExcelQuestions([]);
      setOpen(false);
      onReload();
    } catch (err: any) {
      toast.error(err.message || "Failed to import questions.");
    } finally {
      setSaving(false);
    }
  };

  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  // Calculate currently live question IDs from database status
  const liveQuestionIds = useMemo(() => {
    if (session.status !== "live") return [];
    if (session.all_active) return questions.map((q) => q.id);
    const ids = new Set<string>();
    if (currentId) ids.add(currentId);
    activeQuestionIds.forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [session.status, session.all_active, currentId, activeQuestionIds, questions]);

  // Keep checkboxes in sync with live status from the database
  useEffect(() => {
    setCheckedIds(liveQuestionIds);
  }, [liveQuestionIds]);

  const handleActivateSelected = async () => {
    try {
      const patch: any = {
        all_active: false,
        current_question_id: checkedIds.length > 0 ? checkedIds[0] : null,
        active_question_ids: checkedIds,
      };
      if (session.status !== "live" && checkedIds.length > 0) {
        patch.status = "live";
      }
      await updateSession(patch);
      toast.success("Selected question(s) activated");
    } catch (e: any) {
      toast.error(e.message || "Failed to activate selected questions");
    }
  };

  const handleRetakeSelected = () => {
    if (checkedIds.length === 0) {
      toast.error("Please select at least one question to retake");
      return;
    }
    setIsRetakeConfirmOpen(true);
  };

  const confirmRetakeSelected = async () => {
    setIsRetakeConfirmOpen(false);
    try {
      const { error } = await supabase.from("responses").delete().in("question_id", checkedIds);

      if (error) throw error;

      // Touch session to broadcast a realtime update to all student clients
      await supabase.from("sessions").update({ status: session.status }).eq("id", sessionId);

      toast.success("Selected question(s) reset. Students can now retake them!");
      onReload();
    } catch (e: any) {
      toast.error(e.message || "Failed to reset selected questions");
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required");

    const fileExt = file.name.split(".").pop();
    const fileName = `${user.uid}/${crypto.randomUUID()}.${fileExt}`;

    const { data, error } = await supabase.storage.from("question-images").upload(fileName, file);

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("question-images").getPublicUrl(fileName);

    return publicUrl;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const numMarks = Number(marks);
      if (isNaN(numMarks) || numMarks < 0 || !Number.isInteger(numMarks)) {
        toast.error("Marks must be a non-negative integer (0 or more)");
        setSaving(false);
        return;
      }

      let image_url = null;
      if (imageFile) {
        image_url = await uploadImage(imageFile);
      }

      const options =
        type === "wordcloud"
          ? []
          : optionsText
              .split("\n")
              .map((o) => o.trim())
              .filter(Boolean);

      const { error } = await supabase.from("questions").insert({
        session_id: sessionId,
        type,
        title,
        options,
        correct_answer: type === "quiz" ? correct : null,
        question_type: type === "quiz" ? questionType : "Single Correct",
        order_index: questions.length,
        image_url,
        points: numMarks,
        marks: numMarks,
      });

      if (error) throw error;

      toast.success("Question added");
      setOpen(false);
      setTitle("");
      setOptionsText("");
      setCorrect("");
      setQuestionType("Single Correct");
      setImageFile(null);
      setMarks(0);
    } catch (error: any) {
      console.error("Create question error:", error);
      toast.error(error.message || "Failed to create question");
    } finally {
      setSaving(false);
    }
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editType, setEditType] = useState<QType>("poll");
  const [editTitle, setEditTitle] = useState("");
  const [editOptionsText, setEditOptionsText] = useState("");
  const [editQuestionType, setEditQuestionType] = useState<string>("Single Correct");
  const parsedEditOptions = useMemo(() => {
    return editOptionsText
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
  }, [editOptionsText]);
  const [editCorrect, setEditCorrect] = useState("");
  const [editMarks, setEditMarks] = useState<number>(0);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (q: Question) => {
    setEditingQuestion(q);
    setEditType(q.type);
    setEditTitle(q.title);
    setEditOptionsText(q.options?.join("\n") ?? "");
    setEditCorrect(q.correct_answer ?? "");
    setEditQuestionType(q.question_type ?? "Single Correct");
    setEditMarks(q.marks ?? q.points ?? 0);
    setEditImageUrl(q.image_url ?? null);
    setEditImageFile(null);
    setRemoveExistingImage(false);
    setEditOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    setEditSaving(true);
    try {
      const numEditMarks = Number(editMarks);
      if (isNaN(numEditMarks) || numEditMarks < 0 || !Number.isInteger(numEditMarks)) {
        toast.error("Marks must be a non-negative integer (0 or more)");
        setEditSaving(false);
        return;
      }

      let finalImageUrl = editImageUrl;
      if (removeExistingImage) {
        finalImageUrl = null;
      }
      if (editImageFile) {
        finalImageUrl = await uploadImage(editImageFile);
      }

      const options =
        editType === "wordcloud"
          ? []
          : editOptionsText
              .split("\n")
              .map((o) => o.trim())
              .filter(Boolean);

      const { error } = await supabase
        .from("questions")
        .update({
          type: editType,
          title: editTitle,
          options,
          correct_answer: editType === "quiz" ? editCorrect : null,
          question_type: editType === "quiz" ? editQuestionType : "Single Correct",
          image_url: finalImageUrl,
          points: numEditMarks,
          marks: numEditMarks,
        })
        .eq("id", editingQuestion.id);

      if (error) throw error;

      toast.success("Question updated");
      setEditOpen(false);
      onReload();
    } catch (error: any) {
      console.error("Edit question error:", error);
      toast.error(error.message || "Failed to update question");
    } finally {
      setEditSaving(false);
    }
  };

  const remove = (id: string) => {
    setDeleteQuestionId(id);
  };

  const confirmDeleteQuestion = async () => {
    if (!deleteQuestionId) return;
    try {
      const { error } = await supabase.from("questions").delete().eq("id", deleteQuestionId);
      if (error) throw error;
      toast.success("Question deleted successfully");
      onReload();
    } catch (err: any) {
      console.error("Delete question error:", err);
      toast.error(err.message || "Failed to delete question");
    } finally {
      setDeleteQuestionId(null);
    }
  };

  const [uploadingBanner, setUploadingBanner] = useState(false);

  const handleSessionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    try {
      const url = await uploadImage(file);
      const { error } = await supabase
        .from("sessions")
        .update({ image_url: url })
        .eq("id", sessionId);
      if (error) throw error;
      toast.success("Session banner uploaded");
      onReload();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleRemoveSessionImage = async () => {
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ image_url: null })
        .eq("id", sessionId);
      if (error) throw error;
      toast.success("Session banner removed");
      onReload();
    } catch (err: any) {
      toast.error(err.message || "Remove failed");
    }
  };

  const totalSessionMarks = useMemo(() => {
    return questions.reduce((sum, q) => sum + (q.marks ?? q.points ?? 0), 0);
  }, [questions]);

  const [batchMarksOpen, setBatchMarksOpen] = useState(false);
  const [batchMarksMap, setBatchMarksMap] = useState<Record<string, number>>({});
  const [isSavingBatchMarks, setIsSavingBatchMarks] = useState(false);

  const openBatchMarksModal = () => {
    const initialMap: Record<string, number> = {};
    questions.forEach((q) => {
      initialMap[q.id] = q.marks ?? q.points ?? 0;
    });
    setBatchMarksMap(initialMap);
    setBatchMarksOpen(true);
  };

  const handleSaveBatchMarks = async () => {
    setIsSavingBatchMarks(true);
    try {
      const updatePromises = questions.map((q) => {
        const newMarks = batchMarksMap[q.id] !== undefined ? Math.max(0, Number(batchMarksMap[q.id]) || 0) : (q.marks ?? q.points ?? 0);
        return supabase
          .from("questions")
          .update({ points: newMarks, marks: newMarks })
          .eq("id", q.id);
      });

      const results = await Promise.all(updatePromises);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      toast.success("Question marks updated successfully!");
      setBatchMarksOpen(false);
      onReload();
    } catch (err: any) {
      console.error("Failed to update marks:", err);
      toast.error(err.message || "Failed to update marks");
    } finally {
      setIsSavingBatchMarks(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold">Questions</h2>
          <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Total Marks: {totalSessionMarks}
          </span>
          {questions.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={openBatchMarksModal}
              className="gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 text-xs font-semibold rounded-lg h-7 px-2.5"
              title="Customize marks for all questions whenever you need"
            >
              <Award className="h-3.5 w-3.5" /> Customize Marks
            </Button>
          )}
          <span className="text-xs text-muted-foreground hidden sm:inline">
            ({questions.length} {questions.length === 1 ? "question" : "questions"})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Session Banner Image Upload Button */}
          <div className="relative">
            <input
              type="file"
              id="session-banner-upload"
              accept="image/*"
              className="hidden"
              onChange={handleSessionImageUpload}
              disabled={uploadingBanner}
            />
            <Button
              size="sm"
              variant="outline"
              asChild
              disabled={uploadingBanner}
              className="cursor-pointer"
            >
              <label
                htmlFor="session-banner-upload"
                className="flex items-center gap-2 m-0 cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                {uploadingBanner ? "Uploading..." : "Upload Banner"}
              </label>
            </Button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-bg">
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md sm:max-w-xl transition-all duration-300">
              <DialogHeader>
                <DialogTitle>New Question</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* AI Question Generator Card inside Add Question Dialog */}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shadow-sm">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold flex items-center gap-1.5 text-primary">
                      <Sparkles className="h-4 w-4 text-primary animate-pulse" /> AI Question
                      Generator
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Generate multiple questions automatically from a document.
                    </p>
                    <p className="text-[10px] text-amber-500/80 font-medium flex items-center gap-1">
                      <span>⚠️ AI can make mistakes; please verify questions.</span>
                    </p>
                  </div>
                  <AIGenerateDialog
                    sessionId={sessionId}
                    questionsCount={questions.length}
                    onReload={() => {
                      onReload();
                      setOpen(false);
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={type}
                    onValueChange={(v) => {
                      setType(v as QType);
                      // Reset Excel states when type changes
                      setExcelFile(null);
                      setExcelParsingErrors([]);
                      setExcelValidated(false);
                      setExcelQuestions([]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="poll">Poll (MCQ)</SelectItem>
                      <SelectItem value="wordcloud">Word Cloud</SelectItem>
                      <SelectItem value="quiz">Quiz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {type !== "quiz" ? (
                  <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Question</Label>
                        <VoiceInputButton
                          onTranscriptFinal={(txt) => setTitle(txt)}
                          currentValue={title}
                          appendMode={false}
                          buttonText="Voice"
                          size="sm"
                        />
                      </div>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        placeholder="What is..."
                      />
                    </div>
                    {type !== "wordcloud" && (
                      <div className="space-y-2">
                        <Label>Options (one per line)</Label>
                        <Textarea
                          value={optionsText}
                          onChange={(e) => setOptionsText(e.target.value)}
                          rows={4}
                          required
                          placeholder={"Option A\nOption B\nOption C"}
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="nonquiz-marks">Marks</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setMarks(marks === 0 ? 1 : 0)}
                          className="h-6 text-[11px] text-muted-foreground px-2"
                        >
                          {marks === 0 ? "Set 1 Mark" : "No Marks (0)"}
                        </Button>
                      </div>
                      <Input
                        id="nonquiz-marks"
                        type="number"
                        min={0}
                        step={1}
                        value={marks}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setMarks(isNaN(val) ? 0 : Math.max(0, val));
                        }}
                        required
                        placeholder="0 for No Marks, or 1, 2"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Enter marks (e.g. 1, 2) or 0 for No Marks / Ungraded questions.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Question Image (Optional)</Label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                          className="cursor-pointer"
                        />
                        {imageFile && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setImageFile(null)}
                            className="text-destructive"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                    <Button type="submit" disabled={saving} className="w-full gradient-bg">
                      {saving ? "Saving..." : "Create question"}
                    </Button>
                  </form>
                ) : (
                  <Tabs defaultValue="manual" className="w-full">
                    <TabsList className="grid grid-cols-2 p-0.5 bg-muted rounded-lg border">
                      <TabsTrigger value="manual" className="text-xs font-semibold py-1.5">
                        Add Manually
                      </TabsTrigger>
                      <TabsTrigger value="excel" className="text-xs font-semibold py-1.5">
                        Upload Excel
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="manual" className="space-y-4 mt-4">
                      <form onSubmit={handleCreate} className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Question</Label>
                            <VoiceInputButton
                              onTranscriptFinal={(txt) => setTitle(txt)}
                              currentValue={title}
                              appendMode={false}
                              buttonText="Voice"
                              size="sm"
                            />
                          </div>
                          <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            placeholder="What is..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Options (one per line)</Label>
                          <Textarea
                            value={optionsText}
                            onChange={(e) => setOptionsText(e.target.value)}
                            rows={4}
                            required
                            placeholder={"Option A\nOption B\nOption C"}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Question Type</Label>
                          <select
                            value={questionType}
                            onChange={(e) => {
                              setQuestionType(e.target.value);
                              setCorrect("");
                            }}
                            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="Single Correct">Single Correct</option>
                            <option value="Multiple Correct">Multiple Correct</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label>Correct Answer(s)</Label>
                          {parsedOptions.length === 0 ? (
                            <div className="text-xs text-muted-foreground border border-dashed rounded-lg p-3 text-center bg-card/25">
                              Add options above first, then select the correct answer here.
                            </div>
                          ) : questionType === "Multiple Correct" ? (
                            <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/10 max-h-40 overflow-y-auto">
                              {parsedOptions.map((opt) => {
                                const selectedList = correct
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                                const isChecked = selectedList.includes(opt);
                                return (
                                  <label
                                    key={opt}
                                    className="flex items-center gap-2.5 text-sm cursor-pointer select-none py-0.5 hover:text-primary transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        let nextList = [...selectedList];
                                        if (e.target.checked) {
                                          nextList.push(opt);
                                        } else {
                                          nextList = nextList.filter((s) => s !== opt);
                                        }
                                        setCorrect(nextList.join(", "));
                                      }}
                                      className="rounded border-border text-primary h-4 w-4"
                                    />
                                    <span>{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <select
                              value={correct}
                              onChange={(e) => setCorrect(e.target.value)}
                              required
                              className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <option value="">Select correct option</option>
                              {parsedOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="create-quiz-marks">Marks</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setMarks(marks === 0 ? 1 : 0)}
                              className="h-6 text-[11px] text-muted-foreground px-2"
                            >
                              {marks === 0 ? "Set 1 Mark" : "No Marks (0)"}
                            </Button>
                          </div>
                          <Input
                            id="create-quiz-marks"
                            type="number"
                            min={0}
                            step={1}
                            value={marks}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setMarks(isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            required
                            placeholder="0 for No Marks, or 1, 2, 5"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Enter marks (e.g. 1, 2, 5) or 0 for No Marks / Ungraded questions.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Question Image (Optional)</Label>
                          <div className="flex items-center gap-3">
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                              className="cursor-pointer"
                            />
                            {imageFile && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setImageFile(null)}
                                className="text-destructive"
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </div>
                        <Button type="submit" disabled={saving} className="w-full gradient-bg">
                          {saving ? "Saving..." : "Create question"}
                        </Button>
                      </form>
                    </TabsContent>

                    <TabsContent value="excel" className="space-y-4 mt-4">
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-primary/20 bg-primary/5 gap-3">
                          <div className="space-y-0.5">
                            <h4 className="font-semibold text-xs flex items-center gap-1">
                              <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                              Import Template
                            </h4>
                            <p className="text-[10px] text-muted-foreground">
                              Use our Excel sheet template to import multiple quiz questions.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={handleDownloadTemplate}
                            className="gap-1 text-xs shrink-0 h-8 font-bold"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </Button>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="excel-upload-file">Select Spreadsheet (.xlsx)</Label>
                          <div className="flex gap-2">
                            <Input
                              id="excel-upload-file"
                              type="file"
                              accept=".xlsx"
                              onChange={(e) => {
                                setExcelFile(e.target.files?.[0] ?? null);
                                setExcelValidated(false);
                                setExcelParsingErrors([]);
                                setExcelQuestions([]);
                              }}
                              className="text-xs file:bg-primary file:text-primary-foreground file:border-0 file:rounded file:px-2.5 file:py-0.5 hover:file:bg-primary/90 file:cursor-pointer cursor-pointer"
                            />
                            {excelFile && (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={handleValidateExcel}
                                className="font-bold border text-xs h-9 shrink-0 shadow-sm"
                              >
                                Validate
                              </Button>
                            )}
                          </div>
                        </div>

                        {excelParsingErrors.length > 0 && (
                          <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 space-y-1.5">
                            <h5 className="font-bold text-destructive text-xs flex items-center gap-1">
                              <AlertCircle className="h-4 w-4" />
                              Validation Errors ({excelParsingErrors.length})
                            </h5>
                            <ul className="text-[10px] text-destructive/95 space-y-1 max-h-28 overflow-y-auto pr-1">
                              {excelParsingErrors.map((err, i) => (
                                <li key={i} className="list-disc ml-3">
                                  {err}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {excelValidated && excelQuestions.length > 0 && (
                          <div className="space-y-2 border rounded-lg p-2.5 bg-card">
                            <div className="flex items-center justify-between">
                              <h5 className="font-bold text-xs flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                                Parsed Questions Preview
                              </h5>
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-600 font-semibold px-2 py-0.5 rounded-full">
                                {excelQuestions.length} Questions Validated
                              </span>
                            </div>

                            <div className="overflow-x-auto border rounded max-h-48">
                              <table className="min-w-full divide-y divide-border text-[10px]">
                                <thead className="bg-muted text-muted-foreground sticky top-0">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left font-bold w-12">No.</th>
                                    <th className="px-2 py-1.5 text-left font-bold">
                                      Question Text
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-bold">Type</th>
                                    <th className="px-2 py-1.5 text-left font-bold w-12">Points</th>
                                    <th className="px-2 py-1.5 text-left font-bold">Correct</th>
                                    <th className="px-2 py-1.5 text-left font-bold">Explanation</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border bg-background">
                                  {excelQuestions.map((q, idx) => (
                                    <tr key={idx} className="hover:bg-accent/40 transition-colors">
                                      <td className="px-2 py-1.5 font-mono text-muted-foreground">
                                        {idx + 1}
                                      </td>
                                      <td
                                        className="px-2 py-1.5 font-medium truncate max-w-[120px]"
                                        title={q.title}
                                      >
                                        {q.title}
                                      </td>
                                      <td className="px-2 py-1.5 text-muted-foreground">
                                        {q.question_type}
                                      </td>
                                      <td className="px-2 py-1.5 font-mono">{q.points}</td>
                                      <td className="px-2 py-1.5 font-semibold text-primary">
                                        {q.correct_answer}
                                      </td>
                                      <td
                                        className="px-2 py-1.5 text-muted-foreground truncate max-w-[100px]"
                                        title={q.explanation}
                                      >
                                        {q.explanation || "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        <Button
                          type="button"
                          onClick={handleImportExcelQuestions}
                          disabled={saving || !excelValidated}
                          className="w-full gradient-bg font-bold shadow-md shadow-primary/20"
                        >
                          {saving
                            ? "Importing..."
                            : `Import ${excelQuestions.length || ""} Questions`}
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Question</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEditSave} className="space-y-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={editType} onValueChange={(v) => setEditType(v as QType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="poll">Poll (MCQ)</SelectItem>
                      <SelectItem value="wordcloud">Word Cloud</SelectItem>
                      <SelectItem value="quiz">Quiz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Question</Label>
                    <VoiceInputButton
                      onTranscriptFinal={(txt) => setEditTitle(txt)}
                      currentValue={editTitle}
                      appendMode={false}
                      buttonText="Voice"
                      size="sm"
                    />
                  </div>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    placeholder="What is..."
                  />
                </div>
                {editType !== "wordcloud" && (
                  <div className="space-y-2">
                    <Label>Options (one per line)</Label>
                    <Textarea
                      value={editOptionsText}
                      onChange={(e) => setEditOptionsText(e.target.value)}
                      rows={4}
                      required
                      placeholder={"Option A\nOption B\nOption C"}
                    />
                  </div>
                )}
                {editType === "quiz" && (
                  <>
                    <div className="space-y-2">
                      <Label>Question Type</Label>
                      <select
                        value={editQuestionType}
                        onChange={(e) => {
                          setEditQuestionType(e.target.value);
                          setEditCorrect("");
                        }}
                        className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="Single Correct">Single Correct</option>
                        <option value="Multiple Correct">Multiple Correct</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label>Correct Answer(s)</Label>
                      {parsedEditOptions.length === 0 ? (
                        <div className="text-xs text-muted-foreground border border-dashed rounded-lg p-3 text-center bg-card/25">
                          Add options above first, then select the correct answer here.
                        </div>
                      ) : editQuestionType === "Multiple Correct" ? (
                        <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/10 max-h-40 overflow-y-auto">
                          {parsedEditOptions.map((opt) => {
                            const selectedList = editCorrect
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const isChecked = selectedList.includes(opt);
                            return (
                              <label
                                key={opt}
                                className="flex items-center gap-2.5 text-sm cursor-pointer select-none py-0.5 hover:text-primary transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    let nextList = [...selectedList];
                                    if (e.target.checked) {
                                      nextList.push(opt);
                                    } else {
                                      nextList = nextList.filter((s) => s !== opt);
                                    }
                                    setEditCorrect(nextList.join(", "));
                                  }}
                                  className="rounded border-border text-primary h-4 w-4"
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <select
                          value={editCorrect}
                          onChange={(e) => setEditCorrect(e.target.value)}
                          required
                          className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <option value="">Select correct option</option>
                          {parsedEditOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-question-marks">Marks</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditMarks(editMarks === 0 ? 1 : 0)}
                      className="h-6 text-[11px] text-muted-foreground px-2"
                    >
                      {editMarks === 0 ? "Set 1 Mark" : "No Marks (0)"}
                    </Button>
                  </div>
                  <Input
                    id="edit-question-marks"
                    type="number"
                    min={0}
                    step={1}
                    value={editMarks}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setEditMarks(isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    required
                    placeholder="0 for No Marks, or 1, 2, 5"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Enter marks (e.g. 1, 2, 5) or 0 for No Marks / Ungraded questions.
                  </p>
                </div>

                {editImageUrl && !removeExistingImage && (
                  <div className="space-y-2">
                    <Label>Current Image</Label>
                    <div className="relative rounded-lg border border-border overflow-hidden bg-muted max-h-32 flex items-center justify-center group shadow-sm">
                      <img
                        src={editImageUrl}
                        alt="Question visual"
                        className="max-h-32 object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setRemoveExistingImage(true)}
                        className="absolute top-2 right-2 rounded bg-black/70 p-1 text-xs text-destructive hover:bg-destructive hover:text-white transition"
                      >
                        Remove Image
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>
                    {editImageUrl && !removeExistingImage
                      ? "Replace Image (Optional)"
                      : "Question Image (Optional)"}
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditImageFile(e.target.files?.[0] ?? null)}
                      className="cursor-pointer"
                    />
                    {editImageFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditImageFile(null)}
                        className="text-destructive"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                <Button type="submit" disabled={editSaving} className="w-full gradient-bg">
                  {editSaving ? "Saving..." : "Save changes"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={batchMarksOpen} onOpenChange={setBatchMarksOpen}>
            <DialogContent className="w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-background border border-border text-foreground p-6 sm:p-7 rounded-2xl shadow-2xl scrollbar-thin">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-amber-500">
                  <Award className="h-5 w-5" /> Customize Question Marks
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Quickly customize how many marks each question carries in this quiz, or set 0 for No Marks / Ungraded questions. Changes persist immediately.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Total & Presets */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Total Exam Marks</div>
                    <div className="text-2xl sm:text-3xl font-black text-amber-500 flex items-center gap-2 flex-wrap">
                      <span>{Object.values(batchMarksMap).reduce((sum, v) => sum + (Number(v) || 0), 0)} Marks</span>
                      {Object.values(batchMarksMap).reduce((sum, v) => sum + (Number(v) || 0), 0) === 0 && (
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                          No Marks (Ungraded)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-muted-foreground mr-1">Presets:</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 px-2.5"
                      onClick={() => {
                        const updated: Record<string, number> = {};
                        questions.forEach((q) => {
                          updated[q.id] = 0;
                        });
                        setBatchMarksMap(updated);
                      }}
                    >
                      No Marks (0)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold border-amber-500/30 text-amber-500 hover:bg-amber-500/10 px-2.5"
                      onClick={() => {
                        const updated: Record<string, number> = {};
                        questions.forEach((q) => {
                          updated[q.id] = 1;
                        });
                        setBatchMarksMap(updated);
                      }}
                    >
                      All 1 Mark
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold border-amber-500/30 text-amber-500 hover:bg-amber-500/10 px-2.5"
                      onClick={() => {
                        const updated: Record<string, number> = {};
                        questions.forEach((q) => {
                          updated[q.id] = 2;
                        });
                        setBatchMarksMap(updated);
                      }}
                    >
                      All 2 Marks
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold border-amber-500/30 text-amber-500 hover:bg-amber-500/10 px-2.5"
                      onClick={() => {
                        const updated: Record<string, number> = {};
                        questions.forEach((q) => {
                          updated[q.id] = 5;
                        });
                        setBatchMarksMap(updated);
                      }}
                    >
                      All 5 Marks
                    </Button>
                  </div>
                </div>

                {/* Questions List with Marks Inputs */}
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin">
                  {questions.map((q, idx) => {
                    const currentVal = batchMarksMap[q.id] ?? (q.marks ?? q.points ?? 0);
                    const typeLabel = q.type === "quiz" ? "Quiz" : q.type === "poll" ? "Poll" : "Word Cloud";
                    const typeColor =
                      q.type === "quiz"
                        ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/10"
                        : q.type === "poll"
                          ? "text-blue-500 border-blue-500/20 bg-blue-500/10"
                          : "text-purple-500 border-purple-500/20 bg-purple-500/10";

                    return (
                      <div
                        key={q.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-card/60 hover:bg-card/90 transition"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono font-bold text-muted-foreground">Q{idx + 1}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${typeColor}`}>
                              {typeLabel}
                            </span>
                            {currentVal === 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground border border-border">
                                No Marks
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-foreground font-medium leading-snug break-words">{q.title}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setBatchMarksMap((prev) => ({
                                ...prev,
                                [q.id]: currentVal === 0 ? 1 : 0,
                              }));
                            }}
                            className={`h-8 text-xs px-2.5 font-medium border ${
                              currentVal === 0
                                ? "border-muted-foreground/30 text-muted-foreground bg-muted/40 hover:bg-muted/60"
                                : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {currentVal === 0 ? "Set 1 Mark" : "No Marks (0)"}
                          </Button>
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor={`batch-marks-input-${q.id}`} className="text-xs text-muted-foreground font-medium">
                              Marks:
                            </Label>
                            <Input
                              id={`batch-marks-input-${q.id}`}
                              type="number"
                              min={0}
                              step={1}
                              value={currentVal}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setBatchMarksMap((prev) => ({
                                  ...prev,
                                  [q.id]: isNaN(val) ? 0 : Math.max(0, val),
                                }));
                              }}
                              className="w-20 h-8 text-center font-mono font-bold bg-background border-border text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="border-t border-border/50 pt-4">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setBatchMarksOpen(false)}
                  className="text-xs border-border"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveBatchMarks}
                  disabled={isSavingBatchMarks}
                  className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-1.5"
                >
                  {isSavingBatchMarks ? "Saving Marks..." : "Save Marks"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Preview of current Session-wide Banner Image */}
      {session.image_url && (
        <div className="relative rounded-xl border border-border overflow-hidden bg-muted max-h-48 flex items-center justify-center group shadow-sm">
          <img
            src={session.image_url}
            alt="Session banner preview"
            className="w-full h-full object-contain max-h-48"
          />
          <button
            onClick={handleRemoveSessionImage}
            className="absolute top-2 right-2 rounded-lg bg-black/75 p-1.5 text-white opacity-0 group-hover:opacity-100 transition hover:bg-destructive"
            title="Remove Banner"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {/* ── ONE-CLICK Activate / Deactivate Selected / All ── */}
        {questions.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleActivateSelected}
                disabled={checkedIds.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Activate Selected {checkedIds.length > 0 && `(${checkedIds.length})`}
              </Button>
              <Button
                type="button"
                onClick={handleRetakeSelected}
                disabled={checkedIds.length === 0}
                variant="outline"
                className="flex items-center justify-center gap-1.5 rounded-xl border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-500 font-semibold py-2.5 text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retake Selected {checkedIds.length > 0 && `(${checkedIds.length})`}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={async () => {
                  try {
                    const allIds = questions.map((q) => q.id);
                    const patch: any = { all_active: true, active_question_ids: allIds };
                    if (session.status !== "live") patch.status = "live";
                    await updateSession(patch);
                    toast.success("All questions activated");
                  } catch (e: any) {
                    toast.error(e.message || "Failed to activate all questions");
                  }
                }}
                variant="outline"
                className="flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-semibold py-2.5 text-xs transition-all active:scale-[0.98]"
              >
                <Play className="h-3.5 w-3.5" />
                Activate All
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await updateSession({
                      all_active: false,
                      current_question_id: null,
                      active_question_ids: [],
                    });
                    toast.success("All questions deactivated");
                  } catch (e: any) {
                    toast.error(e.message || "Failed to deactivate questions");
                  }
                }}
                variant="outline"
                className="flex items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive font-semibold py-2.5 text-xs transition-all active:scale-[0.98]"
              >
                <Square className="h-3.5 w-3.5" />
                Deactivate All
              </Button>
            </div>
          </div>
        )}

        {questions.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No questions yet. Add polls, word clouds, or quiz questions to activate live.
          </div>
        )}
        {questions.map((q, i) => {
          const active = q.id === currentId;
          const isQuestionLive = activeQuestionIds.includes(q.id);
          const isLive = session.status === "live" && (active || isAllMode || isQuestionLive);

          return (
            <div
              key={q.id}
              onClick={() => {
                setCheckedIds((prev) =>
                  prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id],
                );
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 transition shadow-sm cursor-pointer select-none",
                isLive
                  ? "border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(59,130,246,0.15)] ring-1 ring-primary/30"
                  : "border-border bg-card/40 hover:bg-card/60",
              )}
            >
              {/* Custom Checkbox */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setCheckedIds((prev) =>
                    prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id],
                  );
                }}
                className={cn(
                  "h-5 w-5 rounded border flex items-center justify-center cursor-pointer transition shrink-0",
                  checkedIds.includes(q.id)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/30 bg-transparent hover:border-primary/50",
                )}
              >
                {checkedIds.includes(q.id) && (
                  <svg
                    className="h-3.5 w-3.5 fill-none stroke-current stroke-[3px]"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              <div
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold transition-colors shrink-0",
                  isLive ? "bg-primary text-primary-foreground" : "bg-accent",
                )}
              >
                {i + 1}
              </div>
              {q.image_url && (
                <div className="h-10 w-10 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center shrink-0">
                  <img
                    src={q.image_url}
                    alt="Question preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{q.title}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                  <span>{q.type}</span>
                  {isLive && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/20 border border-primary/40 px-2 py-0.5 text-[10px] text-primary font-semibold uppercase tracking-wide">
                      ● Live
                    </span>
                  )}
                  {(() => {
                    const m = q.marks ?? q.points ?? 0;
                    return (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground border border-border/50">
                        {m} Mark
                      </span>
                    );
                  })()}
                  {q.image_url && (
                    <span className="flex items-center gap-0.5 text-primary text-[10px] lowercase font-normal">
                      <ImageIcon className="h-3 w-3" /> with image
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit(q);
                }}
                className="text-muted-foreground hover:text-foreground p-1"
                title="Edit Question"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(q.id);
                }}
                className="text-muted-foreground hover:text-destructive p-1"
                title="Delete Question"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <AlertDialog open={isRetakeConfirmOpen} onOpenChange={setIsRetakeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retake Questions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to let students retake the selected {checkedIds.length}{" "}
              question(s)? This will permanently delete their existing responses for these
              questions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRetakeSelected}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Retake
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteQuestionId}
        onOpenChange={(open) => !open && setDeleteQuestionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this question? This will also delete all student
              responses to this question.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteQuestion}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
