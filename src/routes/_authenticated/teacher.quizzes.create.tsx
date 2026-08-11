import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Download, 
  ArrowRight, 
  HelpCircle,
  Play,
  FileText
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// Import schemas and server functions
import { 
  quizMetadataSchema, 
  questionRowSchema,
  getTemplateUrl, 
  uploadAndParseQuiz, 
  createQuizManually 
} from "@/lib/quiz.server";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/teacher/quizzes/create")({
  head: () => ({
    meta: [
      { title: "Create Quiz · KCT PULSE" },
      { name: "description", content: "Create interactive quizzes manually or upload via Excel templates." },
    ],
  }),
  component: CreateQuizPage,
});

const AUDIENCE_OPTIONS = [
  "CSE-A", "CSE-B", "CSE-C",
  "IT-A", "IT-B",
  "ECE-A", "ECE-B", "ECE-C",
  "EEE-A", "EEE-B",
  "MECH-A", "MECH-B",
  "CIVIL-A", "MCT-A"
];

function CreateQuizPage() {
  const navigate = Route.useNavigate();
  const [activeTab, setActiveTab] = useState<"manual" | "excel">("manual");
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  
  // Excel upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [parsingErrors, setParsingErrors] = useState<{ row: number; errors: string[] }[]>([]);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
  const [isValidated, setIsValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch template URL on mount
  useEffect(() => {
    getTemplateUrl()
      .then((res) => setTemplateUrl(res.url))
      .catch((err) => console.error("Error loading template URL:", err));
  }, []);

  // Shared React Hook Form for Metadata
  const metadataForm = useForm<z.infer<typeof quizMetadataSchema>>({
    resolver: zodResolver(quizMetadataSchema),
    defaultValues: {
      title: "",
      description: "",
      start_datetime: "",
      end_datetime: "",
      time_limit_minutes: null,
      shuffle_questions: false,
      shuffle_answers: false,
      max_attempts: 1,
      pass_mark: null,
      target_audience: "",
    }
  });

  // Manual Question Addition Form Hook
  const manualQuestionsForm = useForm({
    defaultValues: {
      questions: [] as any[]
    }
  });

  // Dialog state for manual question adding/editing
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // Dialog input states
  const [modalQuestionText, setModalQuestionText] = useState("");
  const [modalQuestionType, setModalQuestionType] = useState<"Single Correct" | "Multiple Correct">("Single Correct");
  const [modalOptionsText, setModalOptionsText] = useState("");
  const [modalPoints, setModalPoints] = useState(1);
  const [modalExplanation, setModalExplanation] = useState("");
  const [modalCorrectKeys, setModalCorrectKeys] = useState<string[]>([]);

  // Split options by newline and trim
  const parsedOptions = modalOptionsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const handleOpenAddModal = () => {
    setEditingIndex(null);
    setModalQuestionText("");
    setModalQuestionType("Single Correct");
    setModalOptionsText("");
    setModalPoints(1);
    setModalExplanation("");
    setModalCorrectKeys([]);
    setModalOpen(true);
  };

  const handleOpenEditModal = (idx: number) => {
    const q = manualQuestionsForm.getValues("questions")[idx];
    setEditingIndex(idx);
    setModalQuestionText(q.question_text);
    setModalQuestionType(q.question_type as any);
    
    const optionsArray = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e].filter(
      (opt) => opt !== null && opt !== undefined && String(opt).trim() !== ""
    );
    setModalOptionsText(optionsArray.join("\n"));
    setModalPoints(q.points);
    setModalExplanation(q.explanation || "");
    setModalCorrectKeys(q.correct_answer.split(","));
    setModalOpen(true);
  };

  const handleRemoveQuestion = (idx: number) => {
    const current = manualQuestionsForm.getValues("questions");
    const updated = current.filter((_, i) => i !== idx);
    manualQuestionsForm.setValue("questions", updated);
    toast.success("Question deleted.");
  };

  const handleSaveModalQuestion = () => {
    if (!modalQuestionText.trim()) {
      toast.error("Question text is required.");
      return;
    }
    if (parsedOptions.length < 2) {
      toast.error("Please enter at least 2 options (one per line).");
      return;
    }
    if (parsedOptions.length > 5) {
      toast.error("Maximum 5 options (A to E) are supported.");
      return;
    }
    if (modalCorrectKeys.length === 0) {
      toast.error("Please select at least one correct answer.");
      return;
    }
    if (modalQuestionType === "Single Correct" && modalCorrectKeys.length !== 1) {
      toast.error("For Single Correct questions, select exactly one correct answer.");
      return;
    }
    if (modalQuestionType === "Multiple Correct" && modalCorrectKeys.length < 2) {
      toast.error("For Multiple Correct questions, select at least 2 correct answers.");
      return;
    }

    const compiledQuestion = {
      question_text: modalQuestionText.trim(),
      question_type: modalQuestionType,
      option_a: parsedOptions[0] || "",
      option_b: parsedOptions[1] || "",
      option_c: parsedOptions[2] || null,
      option_d: parsedOptions[3] || null,
      option_e: parsedOptions[4] || null,
      correct_answer: modalCorrectKeys.join(","),
      points: Number(modalPoints) || 1,
      explanation: modalExplanation.trim() || null,
    };

    const currentQuestions = manualQuestionsForm.getValues("questions") || [];
    if (editingIndex !== null) {
      const updated = [...currentQuestions];
      updated[editingIndex] = compiledQuestion as any;
      manualQuestionsForm.setValue("questions", updated);
      toast.success("Question updated!");
    } else {
      manualQuestionsForm.setValue("questions", [...currentQuestions, compiledQuestion as any]);
      toast.success("Question added!");
    }

    setModalOpen(false);
  };

  // Handle Excel file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate mime type & extension client side
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "xlsx") {
      toast.error("Only Excel files (.xlsx) are allowed.");
      setSelectedFile(null);
      setFileBase64(null);
      setIsValidated(false);
      return;
    }

    setSelectedFile(file);
    setIsValidated(false);
    setParsingErrors([]);
    setPreviewQuestions([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      const rawBase64 = base64String.split(",")[1];
      setFileBase64(rawBase64);
    };
    reader.readAsDataURL(file);
  };

  // Local client-side parse/preview before submitting
  const handleValidateExcel = async () => {
    if (!fileBase64) {
      toast.error("Please upload an Excel file first.");
      return;
    }

    setSubmitting(true);
    try {
      const metadataValues = metadataForm.getValues();
      
      // We check metadata form validity
      const metaValid = await metadataForm.trigger();
      if (!metaValid) {
        toast.error("Please fix metadata validation errors before validating spreadsheet.");
        setSubmitting(false);
        return;
      }

      // Call the server function to parse
      const result = await uploadAndParseQuiz({
        data: {
          fileBase64,
          metadata: metadataValues
        }
      });

      if (!result.success && result.errors) {
        setParsingErrors(result.errors);
        setIsValidated(false);
        toast.error(`${result.errors.length} validation errors found in the spreadsheet.`);
      } else {
        setParsingErrors([]);
        setIsValidated(true);
        toast.success("Excel template validation successful!");
        
        // Generate a simple read-only preview using client XLSX if needed,
        // or just let them proceed to create.
        // Let's decode locally just for UI preview display.
        const XLSX = await import("xlsx");
        const buffer = Buffer.from(fileBase64, "base64");
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames.find(n => n.toLowerCase() === "questions") || ""];
        if (sheet) {
          const rows = XLSX.utils.sheet_to_json<any>(sheet);
          const activeRows = rows.filter(r => r["Question Text"]);
          setPreviewQuestions(activeRows);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Spreadsheet parsing failed.");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Excel Quiz to Database
  const handleSubmitExcelQuiz = async () => {
    if (!isValidated || !fileBase64) {
      toast.error("Please validate the Excel template successfully before saving.");
      return;
    }

    setSubmitting(true);
    try {
      const metadataValues = metadataForm.getValues();
      const result = await uploadAndParseQuiz({
        data: {
          fileBase64,
          metadata: metadataValues
        }
      });

      if (result.success && result.quizId) {
        toast.success(`Quiz created successfully! Code: ${result.code}`);
        navigate({ to: "/dashboard" });
      } else if (result.errors) {
        setParsingErrors(result.errors);
        setIsValidated(false);
        toast.error("Validation failed during final submission.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Manual Quiz to Database
  const handleSubmitManualQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const metaValid = await metadataForm.trigger();
    const questionsValid = await manualQuestionsForm.trigger();

    if (!metaValid || !questionsValid) {
      toast.error("Please correct the form errors before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const metadataValues = metadataForm.getValues();
      const questionsValues = manualQuestionsForm.getValues().questions;

      // Validate options structure row by row client-side for immediate feedback
      const parsedQuestions = questionsValues.map((q, idx) => {
        const parsed = questionRowSchema.safeParse(q);
        if (!parsed.success) {
          throw new Error(`Question ${idx + 1}: ${parsed.error.errors[0].message}`);
        }
        return parsed.data;
      });

      const result = await createQuizManually({
        data: {
          metadata: metadataValues,
          questions: parsedQuestions
        }
      });

      if (result.success) {
        toast.success(`Quiz created successfully! Code: ${result.code}`);
        navigate({ to: "/dashboard" });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create manual quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Create New Quiz</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build a quiz to test student comprehension.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Metadata Panel (shared across both creation methods) */}
        <div className="lg:col-span-1 glass rounded-2xl border border-border/60 p-6 space-y-5 h-fit shadow-md">
          <h2 className="text-lg font-bold flex items-center gap-2 border-b border-border/40 pb-2">
            <FileText className="h-5 w-5 text-primary" />
            Quiz Configuration
          </h2>

          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Quiz Title *</Label>
              <Input 
                id="title" 
                placeholder="e.g. DSA Midterm Assessment" 
                {...metadataForm.register("title")} 
                className={cn(metadataForm.formState.errors.title && "border-destructive focus-visible:ring-destructive")}
              />
              {metadataForm.formState.errors.title && (
                <p className="text-xs text-destructive">{metadataForm.formState.errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea 
                id="description" 
                placeholder="Enter description, rules, or instructions..." 
                rows={3}
                {...metadataForm.register("description")} 
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start_datetime">Start Time *</Label>
                <Input 
                  id="start_datetime" 
                  type="datetime-local" 
                  {...metadataForm.register("start_datetime")} 
                  className={cn(metadataForm.formState.errors.start_datetime && "border-destructive focus-visible:ring-destructive")}
                />
                {metadataForm.formState.errors.start_datetime && (
                  <p className="text-xs text-destructive">{metadataForm.formState.errors.start_datetime.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_datetime">End Time *</Label>
                <Input 
                  id="end_datetime" 
                  type="datetime-local" 
                  {...metadataForm.register("end_datetime")} 
                  className={cn(metadataForm.formState.errors.end_datetime && "border-destructive focus-visible:ring-destructive")}
                />
                {metadataForm.formState.errors.end_datetime && (
                  <p className="text-xs text-destructive">{metadataForm.formState.errors.end_datetime.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="time_limit">Time Limit (mins)</Label>
                <Input 
                  id="time_limit" 
                  type="number" 
                  placeholder="Unlimited"
                  {...metadataForm.register("time_limit_minutes")} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_audience">Target Audience *</Label>
                <Select 
                  onValueChange={(val) => metadataForm.setValue("target_audience", val)}
                  defaultValue={metadataForm.getValues("target_audience")}
                >
                  <SelectTrigger id="target_audience" className={cn(metadataForm.formState.errors.target_audience && "border-destructive")}>
                    <SelectValue placeholder="Select Section" />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {metadataForm.formState.errors.target_audience && (
                  <p className="text-xs text-destructive">{metadataForm.formState.errors.target_audience.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="max_attempts">Max Attempts</Label>
                <Input 
                  id="max_attempts" 
                  type="number" 
                  {...metadataForm.register("max_attempts")} 
                  className={cn(metadataForm.formState.errors.max_attempts && "border-destructive")}
                />
                {metadataForm.formState.errors.max_attempts && (
                  <p className="text-xs text-destructive">{metadataForm.formState.errors.max_attempts.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pass_mark">Pass Mark (%)</Label>
                <Input 
                  id="pass_mark" 
                  type="number" 
                  placeholder="e.g. 50"
                  {...metadataForm.register("pass_mark")} 
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/40">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="shuffle_questions">Shuffle Questions</Label>
                  <p className="text-xs text-muted-foreground">Randomize question order for each student</p>
                </div>
                <Switch 
                  id="shuffle_questions" 
                  checked={metadataForm.watch("shuffle_questions")}
                  onCheckedChange={(val) => metadataForm.setValue("shuffle_questions", val)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="shuffle_answers">Shuffle Answers</Label>
                  <p className="text-xs text-muted-foreground">Randomize option order A-E per question</p>
                </div>
                <Switch 
                  id="shuffle_answers" 
                  checked={metadataForm.watch("shuffle_answers")}
                  onCheckedChange={(val) => metadataForm.setValue("shuffle_answers", val)}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Right: Method Tabs (Manual Form vs Excel Upload) */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full">
            <TabsList className="grid grid-cols-2 mb-6 p-1 bg-muted/80 backdrop-blur rounded-xl border border-border/30">
              <TabsTrigger value="manual" className="rounded-lg py-2.5 font-semibold">
                Create Manually
              </TabsTrigger>
              <TabsTrigger value="excel" className="rounded-lg py-2.5 font-semibold flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Upload from Excel
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Create Manually */}
            <TabsContent value="manual" className="space-y-4 outline-none">
              <form onSubmit={handleSubmitManualQuiz} className="space-y-6">
                <div className="glass rounded-2xl border border-border/60 p-6 space-y-6 shadow-md">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      Questions List
                    </h2>
                    <Button 
                      type="button" 
                      onClick={handleOpenAddModal} 
                      variant="outline" 
                      size="sm"
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Add Question
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {manualQuestionsForm.watch("questions") && manualQuestionsForm.watch("questions").map((q, idx) => (
                      <div key={idx} className="flex items-start justify-between p-5 rounded-xl border border-border/60 bg-card/20 shadow-sm gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground bg-accent px-2.5 py-1 rounded-lg">
                              Q{idx + 1}
                            </span>
                            <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
                              {q.question_type}
                            </span>
                            <span className="text-xs font-semibold text-muted-foreground">
                              Points: {q.points}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm leading-relaxed">{q.question_text}</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-xs text-muted-foreground pt-1">
                            <div>A. {q.option_a}</div>
                            <div>B. {q.option_b}</div>
                            {q.option_c && <div>C. {q.option_c}</div>}
                            {q.option_d && <div>D. {q.option_d}</div>}
                            {q.option_e && <div>E. {q.option_e}</div>}
                          </div>
                          <div className="text-xs font-semibold text-emerald-500 pt-1">
                            Correct: {q.correct_answer}
                          </div>
                          {q.explanation && (
                            <p className="text-[11px] text-muted-foreground italic leading-relaxed">
                              Explanation: {q.explanation}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleOpenEditModal(idx)}
                            className="h-8 px-2.5 font-bold"
                          >
                            Edit
                          </Button>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleRemoveQuestion(idx)}
                            className="h-8 px-2.5 text-destructive hover:bg-destructive/10"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}

                    {(!manualQuestionsForm.watch("questions") || manualQuestionsForm.watch("questions").length === 0) && (
                      <div className="text-center py-8 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                        No questions added yet. Click "+ Add Question" to start building your quiz.
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 justify-end border-t border-border/40 pt-4">
                    <Button 
                      type="submit" 
                      disabled={submitting || !manualQuestionsForm.watch("questions") || manualQuestionsForm.watch("questions").length === 0} 
                      className="gradient-bg gap-2 px-6 font-bold shadow-md shadow-primary/20"
                    >
                      {submitting ? "Saving..." : "Create Quiz"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </form>

              {/* Popup Dialog Modal for Question Creator (Image 2 style) */}
              <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="max-w-lg glass border border-border/60 shadow-2xl rounded-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold">
                      {editingIndex !== null ? "Edit Question" : "New Question"}
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="q-type">Type</Label>
                      <Select 
                        onValueChange={(val: any) => {
                          setModalQuestionType(val);
                          setModalCorrectKeys([]);
                        }} 
                        value={modalQuestionType}
                      >
                        <SelectTrigger id="q-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Single Correct">Single Correct</SelectItem>
                          <SelectItem value="Multiple Correct">Multiple Correct</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="q-text">Question</Label>
                      <Input 
                        id="q-text" 
                        value={modalQuestionText} 
                        onChange={(e) => setModalQuestionText(e.target.value)} 
                        placeholder="What is..." 
                        required 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="q-options">Options (one per line)</Label>
                      <Textarea 
                        id="q-options" 
                        value={modalOptionsText} 
                        onChange={(e) => {
                          setModalOptionsText(e.target.value);
                          // Clear answer keys that might exceed the new options length
                          const lines = e.target.value.split("\n").map(l => l.trim()).filter(Boolean).length;
                          setModalCorrectKeys(prev => prev.filter(key => {
                            const index = ["A", "B", "C", "D", "E"].indexOf(key);
                            return index >= 0 && index < lines;
                          }));
                        }} 
                        rows={4} 
                        required 
                        placeholder={"Option A\nOption B\nOption C (Optional)"} 
                      />
                    </div>

                    {parsedOptions.length >= 2 && (
                      <div className="space-y-2">
                        <Label>Correct answer(s) (select all that apply)</Label>
                        <div className="grid gap-2 border border-border/40 rounded-xl p-3 bg-accent/10">
                          {parsedOptions.slice(0, 5).map((opt, idx) => {
                            const letter = ["A", "B", "C", "D", "E"][idx];
                            const isChecked = modalCorrectKeys.includes(letter);
                            return (
                              <button
                                key={letter}
                                type="button"
                                onClick={() => {
                                  if (modalQuestionType === "Single Correct") {
                                    setModalCorrectKeys([letter]);
                                  } else {
                                    if (isChecked) {
                                      setModalCorrectKeys(prev => prev.filter(k => k !== letter));
                                    } else {
                                      setModalCorrectKeys(prev => [...prev, letter].sort());
                                    }
                                  }
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all text-xs font-semibold",
                                  isChecked
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border/60 bg-transparent hover:bg-muted/10 text-muted-foreground"
                                )}
                              >
                                <span className="flex items-center gap-2">
                                  <span className="text-primary font-bold">{letter}.</span>
                                  <span>{opt}</span>
                                </span>
                                <span className="w-4 h-4 rounded-full border border-muted-foreground/40 grid place-items-center">
                                  {isChecked && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="q-points">Points</Label>
                        <Input 
                          id="q-points" 
                          type="number" 
                          value={modalPoints} 
                          onChange={(e) => setModalPoints(Number(e.target.value) || 1)} 
                          min={0}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="q-explanation">Explanation (Optional)</Label>
                        <Input 
                          id="q-explanation" 
                          value={modalExplanation} 
                          onChange={(e) => setModalExplanation(e.target.value)} 
                          placeholder="e.g. Option A is correct because..."
                        />
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="mt-2">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      onClick={() => setModalOpen(false)}
                      className="font-semibold"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="button" 
                      onClick={handleSaveModalQuestion}
                      className="gradient-bg font-bold shadow-md shadow-primary/10"
                    >
                      {editingIndex !== null ? "Save Changes" : "Create question"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* Tab 2: Upload from Excel */}
            <TabsContent value="excel" className="space-y-6 outline-none">
              <div className="glass rounded-2xl border border-border/60 p-6 space-y-6 shadow-md">
                
                {/* 1. Download Template Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5 gap-4">
                  <div className="space-y-0.5">
                    <h3 className="font-semibold text-sm flex items-center gap-1.5">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      Excel Import Template
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Download our pre-formatted spreadsheet template. Fill in questions, options, and answers.
                    </p>
                  </div>
                  {templateUrl ? (
                    <a href={templateUrl} download className="shrink-0">
                      <Button variant="outline" size="sm" type="button" className="gap-1.5 font-semibold">
                        <Download className="h-4 w-4" />
                        Download Template
                      </Button>
                    </a>
                  ) : (
                    <Button variant="outline" size="sm" disabled type="button" className="gap-1.5 shrink-0">
                      <LoaderIcon /> Loading...
                    </Button>
                  )}
                </div>

                {/* 2. File Selection Input */}
                <div className="space-y-2">
                  <Label htmlFor="excel-file">Select Excel File (.xlsx) *</Label>
                  <div className="flex items-center gap-3">
                    <Input 
                      id="excel-file" 
                      type="file" 
                      accept=".xlsx" 
                      onChange={handleFileChange}
                      className="flex-1 file:bg-primary file:text-primary-foreground file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3 hover:file:bg-primary/90 file:cursor-pointer cursor-pointer"
                    />
                    {selectedFile && (
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleValidateExcel}
                        disabled={submitting}
                        className="font-bold border border-border shrink-0 shadow-sm"
                      >
                        {submitting ? "Analyzing..." : "Validate & Preview"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* 3. Validation Report Area */}
                {parsingErrors.length > 0 && (
                  <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 space-y-2">
                    <h3 className="font-bold text-destructive text-sm flex items-center gap-1.5">
                      <AlertCircle className="h-4.5 w-4.5" />
                      Validation Failed ({parsingErrors.length} rows with errors)
                    </h3>
                    <ul className="text-xs text-destructive/95 space-y-1.5 max-h-40 overflow-y-auto pr-2">
                      {parsingErrors.map((err, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-extrabold shrink-0">Row {err.row}:</span>
                          <span className="list-disc pl-1">{err.errors.join(" | ")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {isValidated && parsingErrors.length === 0 && (
                  <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1 flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    <div>
                      <h3 className="font-bold text-emerald-500 text-sm">Validation Passed</h3>
                      <p className="text-xs text-muted-foreground">The Excel sheet is parsed and validated successfully. Review the questions preview below.</p>
                    </div>
                  </div>
                )}

                {/* 4. Table Preview of Questions */}
                {previewQuestions.length > 0 && (
                  <div className="space-y-2 border-t border-border/40 pt-4">
                    <h3 className="font-bold text-sm">Questions Preview ({previewQuestions.length})</h3>
                    <div className="rounded-xl border border-border/60 overflow-hidden max-h-64 overflow-y-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-muted border-b border-border/60 text-muted-foreground font-semibold">
                            <th className="p-3 w-12 text-center">No.</th>
                            <th className="p-3">Question Text</th>
                            <th className="p-3 w-28">Type</th>
                            <th className="p-3 w-20 text-center">Correct</th>
                            <th className="p-3 w-16 text-center">Points</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {previewQuestions.map((q, idx) => (
                            <tr key={idx} className="hover:bg-muted/30">
                              <td className="p-3 text-center text-muted-foreground font-medium">{q["Question No."] || idx + 1}</td>
                              <td className="p-3 font-medium truncate max-w-xs" title={q["Question Text"]}>{q["Question Text"]}</td>
                              <td className="p-3 text-muted-foreground">{q["Question Type"]}</td>
                              <td className="p-3 text-center font-bold text-primary">{q["Correct Answer"]}</td>
                              <td className="p-3 text-center">{q["Points"] !== undefined && q["Points"] !== "" ? q["Points"] : 1}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. Submit / Action Row */}
                <div className="flex justify-end border-t border-border/40 pt-4">
                  <Button 
                    type="button"
                    onClick={handleSubmitExcelQuiz}
                    disabled={submitting || !isValidated}
                    className="gradient-bg gap-2 px-6 font-bold shadow-md shadow-primary/20"
                  >
                    {submitting ? "Processing..." : "Create Quiz"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>

              </div>
            </TabsContent>
          </Tabs>
        </div>

      </div>
    </div>
  );
}

function LoaderIcon() {
  return (
    <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
