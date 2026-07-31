import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { User, Calendar, Shield, PresentationIcon, Mail, Upload, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  component: ProfilePage,
});

// Helper to compute SHA-256 hash of a string in browser (used for Gravatar URL fallback)
async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [role, setRole] = useState<string>("Faculty");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [sessionCount, setSessionCount] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const user = auth.currentUser;
      if (!user) return;
      
      const userEmail = user.email ?? "";
      setEmail(userEmail);

      // 1. Get profile data
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, created_at")
        .eq("id", user.uid)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name ?? "");
        
        // Use database avatar, otherwise compute Gravatar fallback based on email
        if (profile.avatar_url) {
          setAvatarUrl(profile.avatar_url);
        } else if (userEmail) {
          const emailHash = await sha256(userEmail);
          setAvatarUrl(`https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=200`);
        }

        if (profile.created_at) {
          setCreatedAt(new Date(profile.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }));
        }
      } else if (userEmail) {
        // Fallback for new profiles
        const emailHash = await sha256(userEmail);
        setAvatarUrl(`https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=200`);
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be under 5 MB");
      return;
    }

    setUploading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      const fileExt = file.name.split(".").pop();
      const fileName = `profile-avatars/${user.uid}-${crypto.randomUUID()}.${fileExt}`;

      // Upload file to Supabase storage bucket
      const { error: uploadError } = await supabase.storage
        .from("question-images")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("question-images")
        .getPublicUrl(fileName);

      // Save public URL in user's profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.uid);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      toast.success("Profile photo updated successfully! 🎉");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploading(false);
    }
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
        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="h-24 w-24 rounded-2xl object-cover border-2 border-primary/50 shadow-md group-hover:opacity-75 transition-all"
            />
          ) : (
            <div className="h-24 w-24 rounded-2xl bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-primary shadow-md group-hover:opacity-75 transition-all">
              <User className="h-10 w-10" />
            </div>
          )}
          
          {/* Hover Overlay to change avatar */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-all">
            {uploading ? (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            ) : (
              <Upload className="h-6 w-6 text-white" />
            )}
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
            disabled={uploading}
          />
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
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-primary hover:underline flex items-center gap-1 mt-1 justify-center sm:justify-start mx-auto sm:mx-0"
          >
            <Upload className="h-3 w-3" /> Change Profile Photo
          </button>
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
