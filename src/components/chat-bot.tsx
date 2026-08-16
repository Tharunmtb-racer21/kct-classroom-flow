import { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Bot, Loader2, Sparkles } from "lucide-react";
import { generateChatResponse, type ChatMessage } from "@/lib/ai-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load welcome message on mount
  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: "Hello! I am PULSE AI, your virtual assistant for KCT PULSE. How can I assist you with hosting sessions, managing polls, quizzes, word clouds, or securing your application today?",
      },
    ]);
  }, []);

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

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");

    // Add user message
    const updatedMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: userText },
    ];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      // Build prompt payload with app-specific system instructions
      const payload: ChatMessage[] = [
        {
          role: "system",
          content: "You are PULSE AI, the virtual assistant for KCT PULSE (Kumaraguru College of Technology Classroom Flow). KCT PULSE is an engagement platform that lets faculty host live lectures with quizzes, interactive polls, word clouds, and PDF exports. Faculty register using their college institutional email (@kct.ac.in). Student participation requires no login, they join using a 6-character shortcode. The app is protected by KCT SHIELD, a custom Web Application Firewall sitting on Port 3000 that filters SQLi, XSS, and path traversal attacks. Keep your responses highly helpful, friendly, concise, and focused on helping users navigate the app. Answer in 2-3 sentences max.",
        },
        // Limit context depth to prevent token bloat
        ...updatedMessages.slice(-6),
      ];

      const reply = await generateChatResponse(payload);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err: any) {
      console.error("[KCT Chatbot] Reply failure:", err);
      toast.error("Failed to receive reply from PULSE AI.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I encountered a minor network error. Could you try sending that again?" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 select-none">
      {/* Floating Action Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setHasNewMessage(false);
        }}
        className={cn(
          "h-14 w-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer relative",
          isOpen 
            ? "bg-rose-600 hover:bg-rose-500 rotate-90" 
            : "gradient-bg hover:brightness-110 shadow-primary/30"
        )}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageSquare className="h-6 w-6" />
            {hasNewMessage && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-[9px] font-bold items-center justify-center text-white">1</span>
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat Window Dialog */}
      {isOpen && (
        <div className="absolute bottom-18 right-0 w-[360px] h-[500px] rounded-3xl overflow-hidden glass border border-border/80 shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-6 duration-300">
          {/* Header */}
          <div className="gradient-bg p-4 flex items-center justify-between text-white border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/20 grid place-items-center text-white">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-1">
                  PULSE AI Assistant <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
                </h4>
                <p className="text-[10px] text-white/70 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online • Nvidia / Groq powered
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages Thread Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/40">
            {messages.map((msg, index) => {
              const isAi = msg.role === "assistant";
              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-start gap-2 max-w-[85%] text-xs leading-relaxed animate-in fade-in duration-200",
                    isAi ? "mr-auto flex-row" : "ml-auto flex-row-reverse"
                  )}
                >
                  {isAi && (
                    <div className="h-6 w-6 rounded-lg bg-primary/10 border border-primary/30 grid place-items-center text-primary shrink-0">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "p-3 rounded-2xl border",
                      isAi
                        ? "bg-card border-border/50 text-foreground rounded-tl-none"
                        : "gradient-bg text-white border-primary/30 rounded-tr-none shadow-md"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-start gap-2 max-w-[85%] text-xs mr-auto animate-pulse">
                <div className="h-6 w-6 rounded-lg bg-primary/10 border border-primary/30 grid place-items-center text-primary shrink-0">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="p-3 rounded-2xl bg-card border border-border/50 text-muted-foreground rounded-tl-none flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" /> Analysing query...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Send Input Area */}
          <form
            onSubmit={handleSend}
            className="p-3 bg-card/60 border-t border-border/60 flex gap-2"
          >
            <Input
              type="text"
              placeholder="Ask PULSE AI anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 h-9 text-xs bg-background/50 border-border focus-visible:ring-primary"
              disabled={loading}
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
    </>
  );
}
