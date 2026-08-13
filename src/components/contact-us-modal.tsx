import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { auth } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Loader2, Mail, MessageSquare, Send, User } from "lucide-react";
import { toast } from "sonner";

interface ContactUsModalProps {
  children: React.ReactNode;
}

export function ContactUsModal({ children }: ContactUsModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("General Feedback");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Prefill details if user is logged in
  useEffect(() => {
    if (open) {
      const user = auth.currentUser;
      if (user) {
        if (user.displayName) setName(user.displayName);
        if (user.email) setEmail(user.email);
      }
    }
  }, [open]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setSubject("General Feedback");
    setMessage("");
    setStatus("idle");
    setErrorMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple Validation
    if (!name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      toast.error("Please write a message (at least 10 characters).");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      // 1. Save message to Supabase database
      const firebaseUser = auth.currentUser;
      const { error: dbError } = await supabase
        .from("contact_messages")
        .insert({
          name: name.trim(),
          email: email.trim(),
          subject,
          message: message.trim(),
          user_id: firebaseUser?.uid || null,
          status: "unread"
        });

      if (dbError) {
        console.error("[ContactUs] Supabase insertion failed:", dbError);
        throw new Error(dbError.message || "Failed to save message to the database.");
      }

      // 2. Send email via Web3Forms if access key is available
      const web3FormsKey = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY;
      if (web3FormsKey) {
        try {
          const emailResponse = await fetch("https://api.web3forms.com/submit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              access_key: web3FormsKey,
              name: name.trim(),
              email: email.trim(),
              subject: `[KCT PULSE Contact] ${subject} - from ${name.trim()}`,
              message: message.trim(),
              replyto: email.trim(),
              from_name: "KCT PULSE Feedback System",
            }),
          });

          if (!emailResponse.ok) {
            const errData = await emailResponse.json();
            console.warn("[ContactUs] Web3Forms email notification failed to send:", errData);
          } else {
            console.log("[ContactUs] Email notification successfully sent to Developer.");
          }
        } catch (mailErr) {
          console.warn("[ContactUs] Web3Forms network error:", mailErr);
          // Don't fail the entire submission if email notification fails, since it is saved in the DB
        }
      } else {
        console.info("[ContactUs] VITE_WEB3FORMS_ACCESS_KEY is not defined. Saved to DB only.");
      }

      setStatus("success");
      toast.success("Message submitted successfully!");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "An unexpected error occurred. Please try again.");
      toast.error("Failed to send message. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) resetForm();
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[500px] overflow-hidden glass rounded-3xl border border-border/80 shadow-2xl p-6 select-none animate-in fade-in zoom-in-95 duration-200">
        {status === "success" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 shadow-inner">
              <CheckCircle2 className="h-10 w-10 animate-bounce" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black tracking-tight text-foreground">Message Sent!</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground max-w-sm">
                Thank you for contacting us. Your message has been sent to the developers and logged in the system telemetry. We appreciate your feedback!
              </DialogDescription>
            </div>
            <Button 
              onClick={() => setOpen(false)} 
              className="mt-6 px-8 gradient-bg font-semibold"
            >
              Close Window
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 border border-primary/30 text-primary">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <DialogTitle className="text-xl font-black tracking-tight">Contact Us & Feedback</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground text-left">
                Have a question, feedback, or found a bug? Drop us a message and we'll check it out.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-left">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Full Name
                </Label>
                <Input
                  id="name"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-card/50 border-border"
                  disabled={status === "submitting"}
                  required
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-card/50 border-border"
                  disabled={status === "submitting"}
                  required
                />
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <Label htmlFor="subject" className="text-xs font-semibold text-muted-foreground">
                  Subject / Category
                </Label>
                <Select 
                  value={subject} 
                  onValueChange={setSubject}
                  disabled={status === "submitting"}
                >
                  <SelectTrigger id="subject" className="bg-card/50 border-border">
                    <SelectValue placeholder="Select a topic" />
                  </SelectTrigger>
                  <SelectContent className="glass border-border">
                    <SelectItem value="General Feedback">General Feedback</SelectItem>
                    <SelectItem value="Bug Report">Bug Report</SelectItem>
                    <SelectItem value="Feature Request">Feature Request</SelectItem>
                    <SelectItem value="Session Issue">Session Issue</SelectItem>
                    <SelectItem value="Other">Other Query</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <Label htmlFor="message" className="text-xs font-semibold text-muted-foreground">
                  Your Message
                </Label>
                <Textarea
                  id="message"
                  placeholder="Write your message here (min. 10 characters)..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[100px] bg-card/50 border-border resize-none"
                  disabled={status === "submitting"}
                  required
                />
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs font-semibold text-destructive text-center">
                {errorMsg}
              </p>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={status === "submitting"}
                className="font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={status === "submitting"}
                className="gradient-bg font-semibold gap-2"
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Send Message
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
