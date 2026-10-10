import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { auth } from "@/lib/firebase";
import { logUserLogout } from "@/lib/login-logger";
import {
  User,
  Calendar,
  Shield,
  Presentation,
  Upload,
  Loader2,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  LogOut,
  KeyRound,
  Clock,
  Mail,
  Camera,
} from "lucide-react";
import { formatDisplayName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  component: ProfilePage,
});

function getInitials(name: string, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "FP";
}

function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [role, setRole] = useState<string>("Faculty");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [lastSignIn, setLastSignIn] = useState<string>("");
  const [authProvider, setAuthProvider] = useState<string>("Institutional SSO");
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [sessionCount, setSessionCount] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);

  const loadProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setEmail(user.email ?? "");
    setEmailVerified(Boolean(user.emailVerified));

    // Authenticated identity provider detection
    const providerId = user.providerData?.[0]?.providerId;
    if (providerId === "google.com") {
      setAuthProvider("Google Workspace (Institutional SSO)");
    } else if (providerId === "password") {
      setAuthProvider("Institutional Email & Password");
    } else if (providerId) {
      setAuthProvider(providerId);
    } else {
      setAuthProvider("Institutional Single Sign-On");
    }

    if (user.metadata?.lastSignInTime) {
      setLastSignIn(
        new Date(user.metadata.lastSignInTime).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }

    // 1. Get profile data
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, created_at")
      .eq("id", user.uid)
      .maybeSingle();

    if (profile && !profileErr) {
      setIsSynced(true);
      setFullName(formatDisplayName(profile.full_name, user.email));
      setAvatarUrl(profile.avatar_url);

      const createdDate = profile.created_at || user.metadata?.creationTime;
      if (createdDate) {
        setCreatedAt(
          new Date(createdDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        );
      }
    } else {
      setIsSynced(false);
      setFullName(formatDisplayName(user.displayName, user.email));
      setAvatarUrl(user.photoURL);
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
    if (!fullName.trim()) {
      toast.error("Name cannot be empty");
      return;
    }

    setSaving(true);
    const user = auth.currentUser;
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user.uid);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated successfully");
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

      const {
        data: { publicUrl },
      } = supabase.storage.from("question-images").getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.uid);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      toast.success("Profile photo updated successfully");
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
      toast.success("Profile photo removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove photo");
    }
  };

  const handleDeleteAccount = () => {
    setIsDeleteAccountOpen(true);
  };

  const confirmDeleteAccount = async () => {
    setIsDeleteAccountOpen(false);
    const user = auth.currentUser;
    if (!user) return;

    try {
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
    await logUserLogout();
    await auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      {/* Page Title & Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Faculty Profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Institutional account credentials, teaching metrics, and security settings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/dashboard/guide">
            <Button variant="outline" size="sm" className="gap-2 border-border/60">
              <BookOpen className="h-4 w-4 text-primary" />
              Faculty Guide
            </Button>
          </Link>
        </div>
      </div>

      {/* Profile Header Identity Card */}
      <div className="glass rounded-2xl p-6 border border-border/50 bg-card/60 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 w-full sm:w-auto">
          {/* Avatar with Upload Capability */}
          <div className="relative group shrink-0">
            <div
              className="h-20 w-20 rounded-full overflow-hidden border-2 border-border/60 bg-muted/40 cursor-pointer shadow-md transition-all group-hover:border-primary/60"
              onClick={() => fileInputRef.current?.click()}
              title="Click to update profile photo"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="h-full w-full object-cover group-hover:opacity-75 transition-opacity"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center font-bold text-xl text-primary bg-primary/10 group-hover:opacity-75 transition-opacity">
                  {getInitials(fullName, email)}
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </div>
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

          {/* Core Identity Details */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {fullName || "KCT Faculty"}
              </h2>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs font-semibold">
                {role}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
              <Mail className="h-3.5 w-3.5 text-muted-foreground/70" />
              <span>{email}</span>
            </div>

            {/* Genuine Account Synchronization State */}
            <div className="flex items-center gap-1.5 text-xs font-medium pt-0.5">
              {isSynced ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Cloud Profile Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Profile Not Initialized
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Primary Header Actions */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/30 justify-end">
          <Button
            onClick={() => setIsEditing(!isEditing)}
            variant={isEditing ? "secondary" : "outline"}
            className="h-9 px-3.5 gap-2 border-border/60 text-sm font-medium"
          >
            <Pencil className="h-3.5 w-3.5" />
            {isEditing ? "Close Editing" : "Edit Profile"}
          </Button>

          <Button
            onClick={logout}
            variant="outline"
            className="h-9 px-3.5 gap-2 border-border/60 text-sm font-medium hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Account Settings Section */}
      <div className="glass rounded-2xl p-6 border border-border/50 bg-card/60 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/30">
          <div>
            <h3 className="text-base font-semibold text-foreground">Account Settings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your personal display information across KCT Pulse sessions.
            </p>
          </div>
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="text-xs gap-1.5 text-primary hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Display Name
            </Button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4 pt-1">
            <div className="space-y-2 max-w-lg">
              <Label htmlFor="display-name" className="text-xs font-semibold uppercase text-muted-foreground">
                Display Name
              </Label>
              <Input
                id="display-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter full name"
                className="h-10 border-border/60"
                autoFocus
              />
            </div>

            <div className="space-y-2 max-w-lg">
              <Label htmlFor="institutional-email" className="text-xs font-semibold uppercase text-muted-foreground">
                Institutional Email
              </Label>
              <Input
                id="institutional-email"
                value={email}
                disabled
                className="h-10 border-border/40 bg-muted/40 font-mono text-muted-foreground cursor-not-allowed"
              />
              <p className="text-[11px] text-muted-foreground">
                Institutional email addresses are managed via Single Sign-On and cannot be altered directly.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <Button onClick={save} disabled={saving} className="gradient-bg font-semibold h-9 px-4">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
              <Button variant="ghost" onClick={() => setIsEditing(false)} className="h-9 px-4">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Display Name</div>
              <div className="text-sm font-medium text-foreground">{fullName || "Not configured"}</div>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Institutional Email</div>
              <div className="text-sm font-mono text-foreground">{email || "Not configured"}</div>
            </div>
          </div>
        )}
      </div>

      {/* Academic Profile Section */}
      <div className="glass rounded-2xl p-6 border border-border/50 bg-card/60 space-y-4">
        <div className="pb-3 border-b border-border/30">
          <h3 className="text-base font-semibold text-foreground">Academic Information</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified institutional role assignment and platform teaching footprint.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-1">
          <div className="space-y-1 p-3.5 rounded-xl border border-border/40 bg-muted/20">
            <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" />
              Institutional Role
            </div>
            <div className="text-base font-bold text-foreground">{role}</div>
            <p className="text-[11px] text-muted-foreground">Platform Access Tier</p>
          </div>

          <div className="space-y-1 p-3.5 rounded-xl border border-border/40 bg-muted/20">
            <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
              <Presentation className="h-3.5 w-3.5 text-primary" />
              Classroom Sessions
            </div>
            <div className="text-base font-bold text-foreground">
              {sessionCount} {sessionCount === 1 ? "Session" : "Sessions"}
            </div>
            <p className="text-[11px] text-muted-foreground">Total Sessions Created</p>
          </div>

          {createdAt ? (
            <div className="space-y-1 p-3.5 rounded-xl border border-border/40 bg-muted/20">
              <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Enrollment Date
              </div>
              <div className="text-base font-bold text-foreground">{createdAt}</div>
              <p className="text-[11px] text-muted-foreground">Profile Established</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Security and Access Section */}
      <div className="glass rounded-2xl p-6 border border-border/50 bg-card/60 space-y-5">
        <div className="pb-3 border-b border-border/30">
          <h3 className="text-base font-semibold text-foreground">Security & Access</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified authentication credentials and platform identity protection.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-primary" />
              Authentication Method
            </div>
            <div className="text-sm font-medium text-foreground">{authProvider}</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Email Verification
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {emailVerified ? "Verified Institutional Account" : "Pending Verification"}
              </span>
              <Badge
                variant="outline"
                className={
                  emailVerified
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]"
                }
              >
                {emailVerified ? "Verified" : "Unverified"}
              </Badge>
            </div>
          </div>

          {lastSignIn ? (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Last Active Sign-In
              </div>
              <div className="text-sm font-medium text-foreground">{lastSignIn}</div>
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" />
              Access Enforcement
            </div>
            <div className="text-sm font-medium text-foreground">
              Faculty Scoped (RLS & Firebase Auth)
            </div>
          </div>
        </div>

        {/* Profile Maintenance & Danger Zone */}
        <div className="pt-4 border-t border-border/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {avatarUrl ? (
              <button
                onClick={handleDeleteProfileImage}
                className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2 transition-colors"
              >
                Remove custom profile picture
              </button>
            ) : (
              <span>Profile avatar uses institutional initials by default.</span>
            )}
          </div>

          <Button
            onClick={handleDeleteAccount}
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive self-start sm:self-auto gap-1.5 h-8 px-2.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Profile Record
          </Button>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={isDeleteAccountOpen} onOpenChange={setIsDeleteAccountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account Profile</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              Are you sure you want to delete your profile record? This action will remove your user profile data from KCT Pulse. Your created classroom sessions will remain preserved in platform archives.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAccount}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              Delete Profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
