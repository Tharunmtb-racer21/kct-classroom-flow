import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  X,
  Send,
  Bot,
  Loader2,
  Sparkles,
  Copy,
  Check,
  Trash2,
  BookOpen,
} from "lucide-react";
import { queryKnowledgeBase } from "@/lib/chatbot/knowledge-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceInputButton } from "@/components/voice-input-button";
import { VoiceWaveform } from "@/components/voice/voice-waveform";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ id: string; title: string; category: string }>;
  timestamp: string;
}

const DEFAULT_SUGGESTIONS = [
  "How do students join?",
  "How do quizzes work?",
  "What is the engagement formula?",
  "How to export PDF reports?",
];

export function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize welcome message on mount
  useEffect(() => {
    resetConversation();
  }, []);

  const resetConversation = () => {
    setMessages([
      {
        id: "msg-welcome",
        role: "assistant",
        content:
          "Hello! I am PULSE Assistant, your in-repository knowledge assistant for KCT PULSE. How can I help you with hosting sessions, managing polls, quizzes, word clouds, or reports today?",
        sources: [
          {
            id: "kb-platform-overview",
            title: "Platform Overview",
            category: "General",
          },
        ],
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  // Scroll to bottom of message thread
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, loading, isOpen]);

  // Alert indicator if closed and message arrives
  useEffect(() => {
    if (!isOpen && messages.length > 1) {
      setHasNewMessage(true);
    }
  }, [messages.length, isOpen]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Answer copied to clipboard!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  };

  const executeQuery = (queryText: string) => {
    const userText = queryText.trim();
    if (!userText || loading) return;

    const userMsg: BotMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    // Natural fluid response delay (200ms) with zero network calls
    setTimeout(() => {
      try {
        const historyForEngine = nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const result = queryKnowledgeBase(userText, historyForEngine);

        const aiMsg: BotMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: result.answer,
          sources: result.sources,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        setMessages((prev) => [...prev, aiMsg]);
      } catch (err: unknown) {
        console.error("[KCT Chatbot] Knowledge query failure:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content:
              "I encountered an error querying the local knowledge base. Please try rephrasing your question.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } finally {
        setLoading(false);
      }
    }, 200);
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeQuery(input);
  };

  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 sm:bottom-6 sm:right-6 z-40 select-none">
      {/* Floating Action Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setHasNewMessage(false);
        }}
        aria-label={isOpen ? "Close PULSE Assistant" : "Open PULSE Assistant"}
        className={cn(
          "h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer relative",
          isOpen
            ? "bg-rose-600 hover:bg-rose-500 rotate-90"
            : "gradient-bg hover:brightness-110 shadow-primary/30",
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5 sm:h-6 sm:w-6" />
        ) : (
          <>
            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
            {hasNewMessage && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-[9px] font-bold items-center justify-center text-white">
                  1
                </span>
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat Window Dialog */}
      {isOpen && (
        <div className="absolute bottom-16 sm:bottom-18 right-0 w-[calc(100vw-2rem)] sm:w-[380px] max-w-[380px] h-[min(540px,calc(100dvh-140px))] rounded-3xl overflow-hidden glass border border-border/80 shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-6 duration-300">
          {/* Header */}
          <div className="gradient-bg p-3.5 sm:p-4 flex items-center justify-between text-white border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/20 grid place-items-center text-white">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-1.5">
                  PULSE Assistant <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
                </h4>
                <p className="text-[10px] text-white/80 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>{" "}
                  Knowledge Base • Instant & Private
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={resetConversation}
                title="Clear conversation"
                aria-label="Clear conversation"
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages Thread Container */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-background/50">
            {messages.map((msg) => {
              const isAi = msg.role === "assistant";
              return (
                <div key={msg.id} className="space-y-1.5">
                  <div
                    className={cn(
                      "flex items-start gap-2 max-w-[88%] text-xs leading-relaxed animate-in fade-in duration-200",
                      isAi ? "mr-auto flex-row" : "ml-auto flex-row-reverse",
                    )}
                  >
                    {isAi && (
                      <div className="h-6 w-6 rounded-lg bg-primary/10 border border-primary/30 grid place-items-center text-primary shrink-0 mt-0.5">
                        <Bot className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div className="space-y-1.5 w-full">
                      <div
                        className={cn(
                          "p-3 rounded-2xl border text-left whitespace-pre-line group relative",
                          isAi
                            ? "bg-card border-border/60 text-foreground rounded-tl-none shadow-sm"
                            : "gradient-bg text-white border-primary/30 rounded-tr-none shadow-md",
                        )}
                      >
                        {msg.content}

                        {/* Copy Button for Assistant Message */}
                        {isAi && (
                          <div className="flex justify-end pt-2 border-t border-border/30 mt-2">
                            <button
                              onClick={() => handleCopy(msg.id, msg.content)}
                              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium transition cursor-pointer bg-accent/40 px-2 py-0.5 rounded-md"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-400" /> Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" /> Copy Answer
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Source Citations */}
                      {isAi && msg.sources && msg.sources.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 px-1">
                          <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                            <BookOpen className="h-2.5 w-2.5 text-primary" /> Sources:
                          </span>
                          {msg.sources.map((src) => (
                            <span
                              key={src.id}
                              className="text-[9px] font-medium bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded"
                            >
                              {src.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Suggested Question Chips (displayed when only welcome message is present) */}
            {messages.length === 1 && (
              <div className="pt-2 pb-1 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                  Suggested Questions:
                </span>
                <div className="flex flex-col gap-1.5">
                  {DEFAULT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => executeQuery(suggestion)}
                      className="text-left text-xs bg-card/80 hover:bg-accent/60 border border-border/60 hover:border-primary/40 text-foreground p-2 rounded-xl transition cursor-pointer flex items-center justify-between group"
                    >
                      <span>{suggestion}</span>
                      <span className="text-primary text-xs opacity-0 group-hover:opacity-100 transition">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-start gap-2 max-w-[85%] text-xs mr-auto animate-pulse">
                <div className="h-6 w-6 rounded-lg bg-primary/10 border border-primary/30 grid place-items-center text-primary shrink-0">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="p-2.5 rounded-2xl bg-card border border-border/50 text-muted-foreground rounded-tl-none flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" /> Searching repository knowledge...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Active Voice Listening Waveform Banner for PULSE AI */}
          {isVoiceListening && (
            <div className="px-3.5 py-2 bg-gradient-to-r from-card/95 via-cyan-950/40 to-card/95 border-t border-cyan-500/30 backdrop-blur-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                </span>
                <span className="text-xs font-semibold text-cyan-300 tracking-wide">
                  Listening...
                </span>
              </div>
              <div className="flex-1 flex justify-center max-w-[210px]">
                <VoiceWaveform active={isVoiceListening} compact={false} />
              </div>
              <span className="text-[11px] text-muted-foreground/80 shrink-0 font-medium">
                Speak now
              </span>
            </div>
          )}

          {/* Send Input Area */}
          <form
            onSubmit={handleSend}
            className="p-3 bg-card/80 border-t border-border/60 flex items-center gap-1.5 shrink-0"
          >
            <Input
              type="text"
              placeholder="Ask about KCT PULSE or speak..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 h-9 text-xs bg-background/60 border-border focus-visible:ring-primary"
              disabled={loading}
            />
            <VoiceInputButton
              currentValue={input}
              onTranscriptFinal={(txt) => executeQuery(txt)}
              onListeningChange={setIsVoiceListening}
              size="icon"
              variant="ghost"
              className={cn(
                "h-9 w-9 shrink-0 text-muted-foreground hover:text-primary transition-all",
                isVoiceListening && "text-cyan-400 bg-cyan-500/10 shadow-[0_0_12px_rgba(6,182,212,0.3)]",
              )}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || loading}
              className="h-9 w-9 gradient-bg shadow-lg shadow-primary/20 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
