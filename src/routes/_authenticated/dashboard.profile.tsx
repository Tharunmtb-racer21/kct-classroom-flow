import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { User, Calendar, Shield, Presentation, Mail, Upload, Loader2, Pencil, Trash2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  component: ProfilePage,
});

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
  const [isEditing, setIsEditing] = useState(false);

  const loadProfile = async () => {
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
      setAvatarUrl(profile.avatar_url); // Remain null (empty placeholder) if no photo exists

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
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const save = async () => {
    setSaving(true);
    const user = auth.currentUser;
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.uid);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated");
      setIsEditing(false);
      loadProfile();
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

      const { error: uploadError } = await supabase.storage
        .from("question-images")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("question-images")
        .getPublicUrl(fileName);

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

  const handleDeleteProfileImage = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.uid);
      if (error) throw error;
      setAvatarUrl(null);
      toast.success("Profile photo removed (set to empty)");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove photo");
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("WARNING: Are you sure you want to delete your profile? This cannot be undone.")) return;
    const user = auth.currentUser;
    if (!user) return;

    try {
      // Delete user profile rows from DB
      const { error } = await supabase.from("profiles").delete().eq("id", user.uid);
      if (error) throw error;

      toast.success("Account profile deleted successfully");
      await auth.signOut();
      navigate({ to: "/", replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete account");
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

      {/* Chrome Profile Settings style Header Card */}
      <div className="mt-8 glass rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 border border-border/40 bg-[#1c2230]/40">
        
        {/* Left Side: Avatar & Details */}
        <div className="flex flex-col sm:flex-row items-center gap-5 w-full sm:w-auto">
          {/* Avatar Image container (Perfect circle) */}
          <div className="relative group cursor-pointer h-20 w-20" onClick={() => fileInputRef.current?.click()}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                className="h-20 w-20 rounded-full object-cover border border-border/60 shadow-md group-hover:opacity-75 transition-all"
              />
            ) : (
              // Empty circular placeholder
              <div className="h-20 w-20 rounded-full bg-[#2a3142] border border-border/30 flex items-center justify-center text-muted-foreground shadow-md group-hover:opacity-75 transition-all">
                <User className="h-8 w-8 text-muted-foreground/60" />
              </div>
            )}
            
            {/* Hover overlay to upload photo */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-all">
              {uploading ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Upload className="h-5 w-5 text-white" />
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

          {/* Name, Email and Sync details */}
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">{fullName || "KCT Faculty"}</h2>
            <div className="text-sm text-muted-foreground/90 font-mono">{email}</div>
            <div className="flex items-center justify-center sm:justify-start gap-1 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 fill-emerald-500/10" />
              <span>Sync is on</span>
            </div>
          </div>
        </div>

        {/* Right Side: Action controls (Edit, Delete, Sign out) */}
        <div className="flex items-center gap-2">
          {/* Edit Profile name button */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-2.5 rounded-lg border border-border/60 hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-all"
            title="Edit Name"
          >
            <Pencil className="h-4.5 w-4.5" />
          </button>

          {/* Delete profile picture (if exists) or delete account profile */}
          <button
            onClick={avatarUrl ? handleDeleteProfileImage : handleDeleteAccount}
            className="p-2.5 rounded-lg border border-border/60 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
            title={avatarUrl ? "Remove Profile Photo" : "Delete Account Profile"}
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>

          {/* Sign out button */}
          <Button
            onClick={logout}
            variant="outline"
            className="h-10 px-4 border-border/60 text-foreground hover:bg-accent/40 transition-all text-sm font-semibold rounded-lg"
          >
            Sign out
          </Button>
        </div>
      </div>

      {/* Inline edit container or full account details */}
      {isEditing ? (
        <div className="mt-6 glass rounded-2xl p-6 space-y-4 border border-border/40">
          <h3 className="text-base font-semibold">Edit Display Name</h3>
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter full name"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="gradient-bg font-semibold">
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 glass rounded-2xl p-6 space-y-4 border border-border/40 text-sm">
          <h3 className="text-base font-semibold border-b border-border/30 pb-2">Academic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs uppercase">Role</div>
              <div className="font-semibold flex items-center gap-1.5 text-foreground">
                <Shield className="h-4 w-4 text-primary" />
                {role}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs uppercase">Sessions Launched</div>
              <div className="font-semibold flex items-center gap-1.5 text-foreground">
                <Presentation className="h-4 w-4 text-primary" />
                {sessionCount} sessions
              </div>
            </div>
            {createdAt && (
              <div className="col-span-2 space-y-1">
                <div className="text-muted-foreground text-xs uppercase">Account Created</div>
                <div className="font-semibold flex items-center gap-1.5 text-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  {createdAt}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
