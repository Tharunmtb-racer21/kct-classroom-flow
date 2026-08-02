import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";

// Helper to check if a user signed in using Google
const isGoogleUser = (user: any): boolean => {
  return user.providerData?.some((p: any) => p.providerId === "google.com") || false;
};

// Allowed institutional email domains — enforced ONLY for Google sign-in path
const KCT_DOMAINS = ["@kct.ac.in", "@kongu.edu"];
const isKctEmail = (emailStr: string, user?: any) => {
  // If the login type isn't Google, allow any personal account email
  if (user && !isGoogleUser(user)) return true;
  return KCT_DOMAINS.some((d) => emailStr.toLowerCase().endsWith(d));
};
const KCT_DOMAIN_ERROR = "Access restricted to KCT institutional accounts (@kct.ac.in). Please use your college email.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Faculty Sign In · KCT PULSE" },
      { name: "description", content: "Sign in to KCT PULSE to launch live classroom sessions." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const syncUserProfile = async (user: any) => {
    if (!user.email || !isKctEmail(user.email, user)) {
      return;
    }
    const { error } = await supabase.from("profiles").upsert({
      id: user.uid,
      email: user.email,
      full_name: user.displayName || user.email?.split("@")[0],
      avatar_url: user.photoURL,
    });
    if (error) {
      console.error("Failed to sync user profile in database:", error);
      toast.error("Database sync failed: " + error.message);
    }
    const { data: roleExists } = await supabase.from("user_roles").select("role").eq("user_id", user.uid).maybeSingle();
    if (!roleExists) {
      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: user.uid,
        role: "faculty",
      });
      if (roleErr) {
        console.error("Failed to sync user role in database:", roleErr);
      }
    }
  };

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
        prompt: "select_account"
      });
      await signInWithPopup(auth, provider);
      // Global listener (onAuthStateChanged) handles post-auth validation & navigation
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
        prompt: "select_account"
      });
      await signInWithPopup(auth, provider);
      // Global listener (onAuthStateChanged) handles post-auth validation & navigation
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Microsoft sign-in failed");
      setLoading(false);
    }
  };

  // KCT_DOMAINS / isKctEmail are defined at module level above

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
          displayName: fullName
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

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4 py-10 bg-cover bg-center bg-fixed bg-no-repeat relative before:absolute before:inset-0 before:bg-background/50 dark:before:bg-background/80"
      style={{ backgroundImage: "url('/kct-bg-new.png')" }}
    >
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle variant="ghost" className="bg-card/40 backdrop-blur border border-border/50" />
      </div>
      <div className="w-full max-w-md relative z-10">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl overflow-hidden shadow-[var(--shadow-glow)]">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-16 w-16 object-cover" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
        </Link>

        <div className="glass rounded-3xl p-8">
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Faculty Sign In" : "Create Faculty Account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your college account or email to continue.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <Button
              onClick={handleMicrosoft}
              disabled={loading}
              variant="outline"
              className="w-full h-11 bg-card/50"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21">
                <path fill="#f25022" d="M0 0h10v10H0z"/>
                <path fill="#7fba00" d="M11 0h10v10H11z"/>
                <path fill="#00a4ef" d="M0 11h10v10H0z"/>
                <path fill="#ffb900" d="M11 11h10v10H11z"/>
              </svg>
              Continue with Microsoft
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            OR
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
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
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" disabled={loading} className="w-full gradient-bg font-semibold h-11">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to KCT PULSE?" : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-foreground hover:underline"
            >
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Students don't need an account — <Link to="/" className="underline">join with a code</Link>.
        </p>
      </div>
    </div>
  );
}