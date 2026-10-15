import { useState, useRef } from "react";
import {
  Sparkles,
  Loader2,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Zap,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { extractTextFromDocument } from "@/lib/document-parser";
import {
  generateQuestionsFromText,
  GeneratedQuestion,
  QType as AIQType,
} from "@/lib/ai-service";

export type AIStep = "upload" | "generating" | "preview";

export function AIGenerateDialog({
  sessionId,
  questionsCount,
  onReload,
}: {
  sessionId: string;
  questionsCount: number;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<AIStep>("upload");

  // Step 1 — upload state
  const [docFile, setDocFile] = useState<File | null>(null);
  const [numQuestions, setNumQuestions] = useState(5);
  const [selectedTypes, setSelectedTypes] = useState<AIQType[]>(["quiz", "poll", "wordcloud"]);

  // Step 2/3 — results state
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleType = (t: AIQType) => {
    setSelectedTypes((prev) =>
      prev.includes(t)
        ? prev.length === 1
          ? prev // must keep at least one
          : prev.filter((x) => x !== t)
        : [...prev, t],
    );
  };

  const resetDialog = () => {
    setStep("upload");
    setDocFile(null);
    setGeneratedQuestions([]);
    setSavingAll(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) resetDialog();
  };

  // ── Step 1 → 2: Extract text & call AI ─────────────────────────────────────
  const handleGenerate = async () => {
    if (!docFile) {
      toast.error("Please select a document file.");
      return;
    }
    if (selectedTypes.length === 0) {
      toast.error("Select at least one question type.");
      return;
    }

    setStep("generating");
    try {
      const text = await extractTextFromDocument(docFile);
      const questions = await generateQuestionsFromText({
        text,
        count: numQuestions,
        types: selectedTypes,
      });
      setGeneratedQuestions(questions);
      setStep("preview");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate questions.");
      setStep("upload");
    }
  };

  // ── Step 3: Bulk save to Supabase ───────────────────────────────────────────
  const handleSaveAll = async () => {
    if (generatedQuestions.length === 0) return;
    setSavingAll(true);
    try {
      const rows = generatedQuestions.map((q, i) => ({
        session_id: sessionId,
        type: q.type as "quiz" | "poll" | "wordcloud",
        title: q.title,
        options: q.options as any,
        correct_answer: q.correct_answer,
        order_index: questionsCount + i,
        points: 0,
      }));
      const { error } = await supabase.from("questions").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} questions added to session! 🎉`);
      onReload();
      handleOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save questions.");
    } finally {
      setSavingAll(false);
    }
  };

  const removeQuestion = (idx: number) => {
    setGeneratedQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, patch: Partial<GeneratedQuestion>) => {
    setGeneratedQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const TYPE_LABELS: Record<AIQType, string> = {
    quiz: "Quiz",
    poll: "Poll",
    wordcloud: "Word Cloud",
  };

  const TYPE_COLORS: Record<AIQType, string> = {
    quiz: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    poll: "text-blue-400 border-blue-500/40 bg-blue-500/10",
    wordcloud: "text-purple-400 border-purple-500/40 bg-purple-500/10",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60 transition-all animate-ai-pulse"
        >
          <Sparkles className="h-4 w-4" />
          AI Generate
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Questions from Document
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2 text-xs text-amber-500/90 mt-1 select-none">
          <span className="text-sm shrink-0">⚠️</span>
          <p className="leading-normal font-medium">
            <strong>Disclaimer:</strong> AI can make mistakes. Please verify facts, options, and
            correct answers before publishing questions to students.
          </p>
        </div>

        {/* ── STEP 1: Upload ─────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-5 mt-2">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>Upload Document</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all",
                  docFile
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-accent/30",
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                />
                {docFile ? (
                  <>
                    <FileText className="h-10 w-10 text-primary" />
                    <div className="text-center">
                      <div className="font-medium text-sm">{docFile.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {(docFile.size / 1024).toFixed(1)} KB · Click to change
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div className="text-center">
                      <div className="font-medium text-sm">Click to upload a document</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        PDF, DOCX, or TXT — max 5 MB
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Question Types */}
            <div className="space-y-2">
              <Label>Question Types to Generate</Label>
              <div className="flex gap-2 flex-wrap">
                {(["quiz", "poll", "wordcloud"] as AIQType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                      selectedTypes.includes(t)
                        ? TYPE_COLORS[t]
                        : "border-border text-muted-foreground hover:border-border/80",
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Number of Questions */}
            <div className="space-y-2">
              <Label>
                Number of Questions: <span className="font-bold text-primary">{numQuestions}</span>
              </Label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4">1</span>
                <input
                  type="range"
                  min={1}
                  max={15}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="flex-1 accent-primary cursor-pointer"
                />
                <span className="text-xs text-muted-foreground w-5">15</span>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!docFile}
              className="w-full gradient-bg gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Generate {numQuestions} Questions with AI
            </Button>
          </div>
        )}

        {/* ── STEP 2: Generating ─────────────────────────────────────────── */}
        {step === "generating" && (
          <div className="flex flex-col items-center justify-center gap-6 py-16">
            <div className="relative">
              <div className="h-20 w-20 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary opacity-80" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <div className="font-semibold text-lg">AI is reading your document...</div>
              <div className="text-sm text-muted-foreground">
                Generating {numQuestions} questions with the secure KCT PULSE AI service
              </div>
              <div className="text-xs text-muted-foreground mt-2">This may take 10–30 seconds</div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Preview ────────────────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {generatedQuestions.length} questions generated — review & edit before saving
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStep("upload")}
                className="gap-1 text-xs"
              >
                ↩ Regenerate
              </Button>
            </div>

            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {generatedQuestions.map((q, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-card/50 p-4 space-y-3 relative group"
                >
                  {/* Remove button */}
                  <button
                    onClick={() => removeQuestion(idx)}
                    className="absolute top-3 right-3 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                    title="Remove this question"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  {/* Type badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        TYPE_COLORS[q.type],
                      )}
                    >
                      {TYPE_LABELS[q.type]}
                    </span>
                    <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                  </div>

                  {/* Question title */}
                  <div className="space-y-1">
                    <Label className="text-xs">Question</Label>
                    <Input
                      value={q.title}
                      onChange={(e) => updateQuestion(idx, { title: e.target.value })}
                      className="text-sm"
                    />
                  </div>

                  {/* Options */}
                  {q.type !== "wordcloud" && q.options.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Options (one per line)</Label>
                      <Textarea
                        value={q.options.join("\n")}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            options: e.target.value
                              .split("\n")
                              .map((o) => o.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={q.options.length}
                        className="text-sm resize-none"
                      />
                    </div>
                  )}

                  {/* Correct answer for quiz */}
                  {q.type === "quiz" && (
                    <div className="space-y-1">
                      <Label className="text-xs text-emerald-400">✓ Correct Answer</Label>
                      <Input
                        value={q.correct_answer ?? ""}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            correct_answer: e.target.value,
                          })
                        }
                        className="text-sm border-emerald-500/30 focus:border-emerald-500/60"
                      />
                    </div>
                  )}
                </div>
              ))}

              {generatedQuestions.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  All questions removed. Click "Regenerate" to start over.
                </div>
              )}
            </div>

            <Button
              onClick={handleSaveAll}
              disabled={savingAll || generatedQuestions.length === 0}
              className="w-full gradient-bg gap-2"
            >
              {savingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add {generatedQuestions.length} Questions to Session
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
