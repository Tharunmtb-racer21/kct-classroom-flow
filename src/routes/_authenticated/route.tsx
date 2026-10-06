import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDisplayName } from "@/lib/utils";
import { ensureSessionLogged, logUserLogout } from "@/lib/login-logger";

const getFirebaseUser = (): Promise<any> => {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getFirebaseUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync current faculty profile to Supabase profiles table and ensure session is logged
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !user.email) return;

    const syncProfileAndSession = async () => {
      try {
        const resolvedName = formatDisplayName(user.displayName, user.email);
        const { error } = await supabase.from("profiles").upsert({
          id: user.uid,
          email: user.email,
          full_name: resolvedName,
          avatar_url: user.photoURL,
        });
        if (error) console.error("Auto profile sync error:", error.message);

        // Resolve existing role and ensure session log exists without duplicating
        let currentRole = "faculty";
        try {
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.uid)
            .maybeSingle();

          if (roleData?.role) {
            currentRole = roleData.role;
          }
        } catch (roleErr) {
          console.warn("Could not resolve role during session restoration:", roleErr);
        }

        await ensureSessionLogged({ uid: user.uid, email: user.email }, currentRole);
      } catch (syncErr) {
        console.error("Auto profile sync error:", syncErr);
      }
    };

    syncProfileAndSession();
  }, []);

  // 30 minutes in milliseconds
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

  const handleLogout = async () => {
    try {
      try {
        await logUserLogout();
      } catch (logErr) {
        console.error("Failed to log logout during inactivity timeout:", logErr);
      }
      await signOut(auth);
      toast.info("Session expired due to inactivity. Please sign in again.");
      navigate({ to: "/auth" });
    } catch (err) {
      console.error("Failed to sign out after inactivity:", err);
    }
  };

  const resetTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(handleLogout, INACTIVITY_TIMEOUT);
  };

  useEffect(() => {
    resetTimer();

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    const handleActivity = () => resetTimer();

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, []);

  return <Outlet />;
}
