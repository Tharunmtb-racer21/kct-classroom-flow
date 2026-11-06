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
  SelectValue,
} from "@/components/ui/select";
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
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    message?: string;
  }>({});
  /** Honeypot field — must remain empty for real users. Hidden via CSS. */
  const [honeypot, setHoneypot] = useState("");
  /** Unix timestamp (ms) when the form was opened, for minimum-time guard. */
  const [openedAt, setOpenedAt] = useState<number>(0);

  useEffect(() => {
    if (open) {
      setOpenedAt(Date.now());
      import("@/lib/firebase")
        .then(({ auth }) => {
          const user = auth.currentUser;
          if (user) {
            if (user.displayName) setName(user.displayName);
            if (user.email) setEmail(user.email);
          }
        })
        .catch((err) => {
          console.error("Failed to load Firebase auth dynamically:", err);
        });
    }
  }, [open]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setSubject("General Feedback");
    setMessage("");
    setStatus("idle");
    setErrorMsg("");
    setFieldErrors({});
    setHoneypot("");
    setOpenedAt(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (status === "submitting") return;

    if (honeypot) {
      setStatus("success");
      return;
    }

    const elapsedSec = (Date.now() - openedAt) / 1000;
    if (openedAt > 0 && elapsedSec < 3) {
      toast.error("Submission too fast. Please review your message and try again.");
      return;
    }

    const { validateFeedbackPayload } = await import("@/lib/feedback-validator");
    const result = validateFeedbackPayload({ name, email, message });

    if (!result.ok) {
      setFieldErrors(result.errors);
      const firstError = result.errors.name ?? result.errors.email ?? result.errors.message;
      if (firstError) toast.error(firstError);
      return;
    }

    setFieldErrors({});
    setStatus("submitting");
    setErrorMsg("");

    const safeNme = result.normalisedName!;
    const safeEmail = result.normalisedEmail!;
    const safeMsg = result.normalisedMessage!;

    try {
      const { submitFeedbackServerFn } = await import("@/lib/feedback-server");
      const res = await submitFeedbackServerFn({
        data: {
          name: safeNme,
          email: safeEmail,
          subject,
          message: safeMsg,
          honeypot,
        },
      });

      if (!res.success) {
        throw new Error(res.message || "Failed to submit feedback.");
      }

      // If server could not deliver via Web3Forms (e.g. serverless IP blocked by Cloudflare),
      // execute direct client-side delivery from the browser as resilient fallback
      if (!res.delivered && typeof window !== "undefined") {
        const clientKey = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY;
        if (clientKey) {
          try {
            const formData = new FormData();
            formData.append("access_key", clientKey);
            formData.append("name", safeNme);
            formData.append("email", safeEmail);
            formData.append("subject", `[KCT PULSE Contact] ${subject} - from ${safeNme}`);
            formData.append("message", safeMsg);
            formData.append("replyto", safeEmail);
            formData.append("from_name", "KCT PULSE Feedback System");

            await fetch("https://api.web3forms.com/submit", {
              method: "POST",
              body: formData,
            });
          } catch (clientDeliveryErr) {
            console.warn("[ContactUs] Browser fallback delivery to Web3Forms failed:", clientDeliveryErr);
          }
        }
      }

      setStatus("success");
      toast.success("Message submitted successfully!");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setStatus("error");
      setErrorMsg(msg);
      toast.error(msg || "Failed to send message. Please try again.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) resetForm();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="sm:max-w-[500px] overflow-hidden glass rounded-3xl border border-border/80 shadow-2xl p-6 select-none animate-in fade-in zoom-in-95 duration-200">
        {status === "success" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 shadow-inner">
              <CheckCircle2 className="h-10 w-10 animate-bounce" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black tracking-tight text-foreground">
                Message Sent!
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground max-w-sm">
                Thank you for contacting us. Your message has been sent to the developers and logged
                in the system telemetry. We appreciate your feedback!
              </DialogDescription>
            </div>
            <Button onClick={() => setOpen(false)} className="mt-6 px-8 gradient-bg font-semibold">
              Close Window
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 border border-primary/30 text-primary">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <DialogTitle className="text-xl font-black tracking-tight">
                  Contact Us &amp; Feedback
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground text-left">
                Have a question, feedback, or found a bug? Drop us a message and we'll check it out.
              </DialogDescription>
            </DialogHeader>

            {/* Honeypot — visually hidden, never filled by real users */}
            <div
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }}
            >
              <label htmlFor="contact_url">URL (leave blank)</label>
              <input
                id="contact_url"
                name="contact_url"
                type="text"
                autoComplete="off"
                tabIndex={-1}
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <div className="space-y-4 text-left">
              {/* Name */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="contact-name"
                  className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"
                >
                  <User className="h-3.5 w-3.5" /> Full Name
                </Label>
                <Input
                  id="contact-name"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  className={`bg-card/50 border-border${fieldErrors.name ? " border-destructive focus-visible:ring-destructive" : ""}`}
                  disabled={status === "submitting"}
                  autoComplete="name"
                  aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
                  aria-invalid={!!fieldErrors.name}
                />
                {fieldErrors.name && (
                  <p
                    id="contact-name-error"
                    className="text-xs text-destructive font-medium"
                    role="alert"
                  >
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="contact-email"
                  className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5" /> Email Address
                </Label>
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email)
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  className={`bg-card/50 border-border${fieldErrors.email ? " border-destructive focus-visible:ring-destructive" : ""}`}
                  disabled={status === "submitting"}
                  autoComplete="email"
                  aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
                  aria-invalid={!!fieldErrors.email}
                />
                {fieldErrors.email && (
                  <p
                    id="contact-email-error"
                    className="text-xs text-destructive font-medium"
                    role="alert"
                  >
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="contact-subject"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Subject / Category
                </Label>
                <Select
                  value={subject}
                  onValueChange={setSubject}
                  disabled={status === "submitting"}
                >
                  <SelectTrigger id="contact-subject" className="bg-card/50 border-border">
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
                <Label
                  htmlFor="contact-message"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Your Message
                </Label>
                <Textarea
                  id="contact-message"
                  placeholder="Write your message here (min. 10 characters)..."
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (fieldErrors.message)
                      setFieldErrors((prev) => ({ ...prev, message: undefined }));
                  }}
                  className={`min-h-[100px] bg-card/50 border-border resize-none${fieldErrors.message ? " border-destructive focus-visible:ring-destructive" : ""}`}
                  disabled={status === "submitting"}
                  aria-describedby={fieldErrors.message ? "contact-message-error" : undefined}
                  aria-invalid={!!fieldErrors.message}
                />
                {fieldErrors.message && (
                  <p
                    id="contact-message-error"
                    className="text-xs text-destructive font-medium"
                    role="alert"
                  >
                    {fieldErrors.message}
                  </p>
                )}
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs font-semibold text-destructive text-center" role="alert">
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
