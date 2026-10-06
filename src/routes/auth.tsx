import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Loader2,
  Mail,
  Sparkles,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { logUserLogin } from "@/lib/login-logger";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContactUsModal } from "@/components/contact-us-modal";
import { formatDisplayName } from "@/lib/utils";
import {
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  ActionCodeSettings,
} from "firebase/auth";

// Storage key for email link authentication across redirects
const EMAIL_LINK_STORAGE_KEY = "kct_email_for_sign_in";

// Generates Firebase action code settings dynamically for local and production domains
const getActionCodeSettings = (): ActionCodeSettings => {
  return {
    // URL redirected back to after opening the magic link
    url: `${window.location.origin}/auth`,
    handleCodeInApp: true,
  };
};

// Helper to check if a user signed in using Google
const isGoogleUser = (user: any): boolean => {
  return user.providerData?.some((p: any) => p.providerId === "google.com") || false;
};

// Error message for non-KCT email login
const KCT_DOMAIN_ERROR =
  "Only official KCT email addresses (@kct.ac.in) are authorized to access this platform.";

// Helper to validate if email belongs to kct.ac.in domain
const isKctEmail = (email: string | null, user?: any): boolean => {
  if (!email) return false;
  const isKct = email.trim().toLowerCase().endsWith("@kct.ac.in");
  if (!isKct && user) {
    signOut(auth).catch(() => {});
  }
  return isKct;
};

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "KCT PULSE" },
      { name: "description", content: "Sign in to KCT PULSE to launch live classroom sessions." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInMethod, setSignInMethod] = useState<"password" | "magic-link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  // Email link (Magic Link) states
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [isVerifyingLink, setIsVerifyingLink] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  const syncUserProfile = async (user: any) => {
    if (!user.email || !isKctEmail(user.email, user)) {
      return;
    }
    const resolvedName = formatDisplayName(user.displayName, user.email);
    const { error } = await supabase.from("profiles").upsert({
      id: user.uid,
      email: user.email,
      full_name: resolvedName,
      avatar_url: user.photoURL,
    });
    if (error) {
      console.error("Failed to sync user profile in database:", error);
      toast.error("Database sync failed: " + error.message);
    }
    let currentRole = "faculty";
    const { data: roleExists } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.uid)
      .maybeSingle();
    if (!roleExists) {
      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: user.uid,
        role: "faculty",
      });
      if (roleErr) {
        console.error("Failed to sync user role in database:", roleErr);
      }
    } else {
      currentRole = roleExists.role;
    }
    // Record login entry in login_logs
    await logUserLogin({ uid: user.uid, email: user.email }, currentRole);
  };

  // Complete sign-in using email link
  const processEmailLinkSignIn = async (emailToUse: string) => {
    if (!isKctEmail(emailToUse)) {
      toast.error("Please enter a valid official KCT email (@kct.ac.in).");
      return;
    }
    setIsVerifyingLink(true);
    try {
      const result = await signInWithEmailLink(auth, emailToUse, window.location.href);
      window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
      // Clean query parameters from URL bar to prevent link replay
      window.history.replaceState({}, document.title, window.location.pathname);
      if (result.user) {
        await syncUserProfile(result.user);
        toast.success("Signed in successfully via Magic Link!");
        navigate({ to: "/dashboard" });
      }
    } catch (err: any) {
      console.error("Email link sign-in error:", err);
      toast.error(err?.message || "Failed to sign in with email link. The link may have expired or already been used.");
      setIsVerifyingLink(false);
      setNeedsEmailConfirmation(false);
    }
  };

  // Detect and handle incoming email sign-in link on page load
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const savedEmail = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY);
      if (!savedEmail) {
        // User clicked link on another browser, incognito, or different device
        setNeedsEmailConfirmation(true);
      } else {
        processEmailLinkSignIn(savedEmail);
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        if (!user.email || !isKctEmail(user.email, user)) {
          await signOut(auth);
          toast.error(KCT_DOMAIN_ERROR);
          setLoading(false);
          return;
        }
        syncUserProfile(user).then(() => {
          navigate({ to: "/dashboard" });
        });
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // Hint the account picker to show only @kct.ac.in accounts and force account selection
      provider.setCustomParameters({
        hd: "kct.ac.in",
        prompt: "select_account",
      });
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        if (!isKctEmail(result.user.email, result.user)) {
          toast.error(KCT_DOMAIN_ERROR);
          setLoading(false);
          return;
        }
        await syncUserProfile(result.user);
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  };

  const handleMicrosoft = async () => {
    setLoading(true);
    try {
      const provider = new OAuthProvider("microsoft.com");
      // Hint Microsoft to show only @kct.ac.in accounts and force account selection
      provider.setCustomParameters({
        domain_hint: "kct.ac.in",
        prompt: "select_account",
      });
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        if (!isKctEmail(result.user.email, result.user)) {
          toast.error(KCT_DOMAIN_ERROR);
          setLoading(false);
          return;
        }
        await syncUserProfile(result.user);
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Microsoft sign-in failed");
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        // Only allow institutional KCT email addresses for faculty accounts
        if (!isKctEmail(email)) {
          toast.error("Please use your KCT institutional email (e.g. name@kct.ac.in).");
          setLoading(false);
          return;
        }
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: fullName });
        await syncUserProfile({
          ...result.user,
          displayName: fullName,
        });
        toast.success("Account created successfully!");
        navigate({ to: "/dashboard" });
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        await syncUserProfile(result.user);
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
      setLoading(false);
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = email.trim();
    if (!isKctEmail(targetEmail)) {
      toast.error("Please enter a valid KCT institutional email (e.g. name@kct.ac.in).");
      return;
    }
    setLoading(true);
    try {
      await sendSignInLinkToEmail(auth, targetEmail, getActionCodeSettings());
      window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, targetEmail);
      setMagicLinkSent(true);
      setMagicLinkEmail(targetEmail);
      toast.success(`Magic sign-in link sent to ${targetEmail}`);
    } catch (err: any) {
      console.error("Failed to send magic link:", err);
      toast.error(err?.message || "Failed to send magic sign-in link. Please check Firebase configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10 bg-cover bg-center bg-fixed bg-no-repeat relative before:absolute before:inset-0 before:bg-background/50 dark:before:bg-background/80"
      style={{ backgroundImage: "url('/kct-bg-new-opt.jpg')" }}
    >
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle variant="ghost" className="bg-card/40 backdrop-blur border border-border/50" />
      </div>
      <div className="w-full max-w-md relative z-10">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl overflow-hidden shadow-[var(--shadow-glow)]">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-16 w-16 object-cover" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight">
            KCT <span className="gradient-text">PULSE</span>
          </span>
        </Link>

        <div className="glass rounded-3xl p-8">
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Faculty Sign In" : "Create Faculty Account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your college account or email to continue.
          </p>

          {/* Cross-device / Incognito Email Link Confirmation */}
          {needsEmailConfirmation ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Sparkles className="h-4 w-4" />
                <span>Confirm Institutional Email</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You opened this sign-in link on a new device or browser. To verify your identity, please enter your official @kct.ac.in email address.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  processEmailLinkSignIn(confirmEmail.trim());
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>KCT Email Address</Label>
                  <Input
                    type="email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    required
                    placeholder="faculty@kct.ac.in"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isVerifyingLink}
                  className="w-full gradient-bg font-semibold h-11"
                >
                  {isVerifyingLink ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying link...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Complete Sign In
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNeedsEmailConfirmation(false)}
                  className="w-full text-xs text-muted-foreground"
                >
                  Cancel and return to sign in
                </Button>
              </form>
            </div>
          ) : isVerifyingLink ? (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-semibold text-sm">Verifying your magic sign-in link...</p>
              <p className="text-xs text-muted-foreground">Authenticating your KCT faculty session, please wait.</p>
            </div>
          ) : magicLinkSent ? (
            <div className="mt-6 space-y-4 text-center py-2">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Mail className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base">Check Your Inbox</h3>
                <p className="text-xs text-muted-foreground">
                  We sent a secure magic link to <strong className="text-foreground">{magicLinkEmail}</strong>.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/40 p-3.5 text-left text-xs text-muted-foreground space-y-1.5">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  What to do next:
                </p>
                <p className="pl-5">1. Open the email sent from KCT PULSE on this device.</p>
                <p className="pl-5">2. Click the sign-in button or link to be authenticated automatically.</p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={(e) => handleSendMagicLink(e)}
                  className="w-full text-xs h-9 bg-card/40"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Resend Magic Link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMagicLinkSent(false)}
                  className="w-full text-xs h-9 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Use password or different email
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-col gap-3">
                <Button
                  onClick={handleMicrosoft}
                  disabled={loading}
                  variant="outline"
                  className="w-full h-11 bg-card/50"
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21">
                    <path fill="#f25022" d="M0 0h10v10H0z" />
                    <path fill="#7fba00" d="M11 0h10v10H11z" />
                    <path fill="#00a4ef" d="M0 11h10v10H0z" />
                    <path fill="#ffb900" d="M11 11h10v10H11z" />
                  </svg>
                  Continue with Microsoft
                </Button>
              </div>

              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                OR
                <div className="h-px flex-1 bg-border" />
              </div>

              {mode === "signin" ? (
                <Tabs
                  value={signInMethod}
                  onValueChange={(val) => setSignInMethod(val as "password" | "magic-link")}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/50 p-1">
                    <TabsTrigger value="password" className="text-xs flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5" />
                      Password
                    </TabsTrigger>
                    <TabsTrigger value="magic-link" className="text-xs flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Magic Link
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="password">
                    <form onSubmit={handleEmail} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          placeholder="faculty@kct.ac.in"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Password</Label>
                        <Input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full gradient-bg font-semibold h-11"
                      >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sign In
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="magic-link">
                    <form onSubmit={handleSendMagicLink} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Institutional Email</Label>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          placeholder="faculty@kct.ac.in"
                        />
                        <p className="text-[11px] text-muted-foreground leading-normal">
                          Password-free sign in. We will send a secure one-click link directly to your official KCT inbox.
                        </p>
                      </div>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full gradient-bg font-semibold h-11"
                      >
                        {loading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Send Magic Link
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              ) : (
                <form onSubmit={handleEmail} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Full name</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="faculty@kct.ac.in"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full gradient-bg font-semibold h-11"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </form>
              )}

              <p className="mt-4 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "New to KCT PULSE?" : "Already have an account?"}{" "}
                <button
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setMagicLinkSent(false);
                  }}
                  className="font-medium text-foreground hover:underline"
                >
                  {mode === "signin" ? "Create account" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Students don't need an account —{" "}
          <Link to="/" className="underline">
            join with a code
          </Link>
          .
        </p>
        <div className="mt-3 text-center text-xs text-muted-foreground/80 font-medium space-y-1">
          <div>Built for Kumaraguru College of Technology</div>
          <div className="flex items-center justify-center gap-2 flex-wrap text-[11px] font-semibold mt-1">
            <span className="text-[color:var(--accent-emerald)]">
              Founder & Designed by <span className="font-bold text-foreground/85">THARUN N E</span>
            </span>
            <span className="text-border/50">·</span>
            <span className="text-primary">
              Developed by <span className="font-bold text-foreground/85">NAVNEETH V</span>
            </span>
            <span className="text-border/50">·</span>
            <ContactUsModal>
              <button className="hover:text-foreground text-primary font-bold cursor-pointer transition-colors">
                Contact Us
              </button>
            </ContactUsModal>
          </div>
        </div>
      </div>
    </div>
  );
}

