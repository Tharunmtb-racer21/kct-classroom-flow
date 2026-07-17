import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import {
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";

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
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
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
      const result = await signInWithPopup(auth, provider);
      await syncUserProfile(result.user);
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  };

  const handleMicrosoft = async () => {
    setLoading(true);
    try {
      const provider = new OAuthProvider("microsoft.com");
      const result = await signInWithPopup(auth, provider);
      await syncUserProfile(result.user);
      navigate({ to: "/dashboard" });
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
      className="min-h-screen flex items-center justify-center px-4 py-10 bg-cover bg-center bg-fixed bg-no-repeat relative before:absolute before:inset-0 before:bg-background/80"
      style={{ backgroundImage: "url('/kct-bg.jpg')" }}
    >
      <div className="w-full max-w-md relative z-10">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl overflow-hidden shadow-[var(--shadow-glow)]">
            <img src="/kct-logo.jpg" alt="KCT Logo" className="h-10 w-10 object-cover" />
          </div>
          <span className="text-xl font-bold">KCT <span className="gradient-text">PULSE</span></span>
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
              onClick={handleGoogle}
              disabled={loading}
              variant="outline"
              className="w-full h-11 bg-card/50"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22z"/><path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </Button>
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
              <Label>College Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@kct.ac.in" />
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