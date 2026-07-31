import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { User, Calendar, Shield, PresentationIcon, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [role, setRole] = useState<string>("Faculty");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [sessionCount, setSessionCount] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const user = auth.currentUser;
      if (!user) return;
      
      setEmail(user.email ?? "");

      // 1. Get profile data
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, created_at")
        .eq("id", user.uid)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name ?? "");
        setAvatarUrl(profile.avatar_url);
        if (profile.created_at) {
          setCreatedAt(new Date(profile.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }));
        }
      }

      // 2. Get user role
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.uid)
        .maybeSingle();
      
      if (userRole?.role) {
        setRole(userRole.role.charAt(0).toUpperCase() + userRole.role.slice(1));
      }

      // 3. Get total sessions created
      const { count } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", user.uid);
      
      setSessionCount(count ?? 0);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const user = auth.currentUser;
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.uid);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated");
  };

  const logout = async () => {
    await auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Faculty Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your institutional profile details and account metadata.</p>

      {/* Profile Card Header */}
      <div className="mt-8 glass rounded-3xl p-6 flex flex-col sm:flex-row items-center gap-6 border border-border/40">
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="h-24 w-24 rounded-2xl object-cover border-2 border-primary/50 shadow-md"
            />
          ) : (
            <div className="h-24 w-24 rounded-2xl bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-primary shadow-md">
              <User className="h-10 w-10" />
            </div>
          )}
        </div>
        <div className="text-center sm:text-left space-y-1.5 flex-1">
          <h2 className="text-xl font-bold">{fullName || "KCT Faculty"}</h2>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-primary" />
              Role: <strong className="text-foreground">{role}</strong>
            </span>
            {createdAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Joined: <strong className="text-foreground">{createdAt}</strong>
              </span>
            )}
            <span className="flex items-center gap-1">
              <PresentationIcon className="h-3.5 w-3.5" />
              Sessions: <strong className="text-foreground">{sessionCount}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 glass rounded-3xl p-6 space-y-6 border border-border/40">
        <h3 className="text-lg font-semibold border-b border-border/30 pb-2">Account Settings</h3>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-muted-foreground" /> Email Address
            </Label>
            <Input value={email} disabled className="bg-muted/40 cursor-not-allowed border-border/60" />
            <p className="text-xs text-muted-foreground/80">Your institutional login email is managed by your organization.</p>
          </div>
          
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <User className="h-4 w-4 text-muted-foreground" /> Full Name
            </Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter full name" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button onClick={save} disabled={saving} className="gradient-bg px-6 font-semibold">{saving ? "Saving..." : "Save changes"}</Button>
          <Button onClick={logout} variant="outline">Sign out</Button>
        </div>
      </div>
    </div>
  );
}
