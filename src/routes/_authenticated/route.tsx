import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { toast } from "sonner";

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

import { supabase } from "@/integrations/supabase/client";

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync current faculty profile to Supabase profiles table
  useEffect(() => {
    const user = auth.currentUser;
    if (user && user.email) {
      const nameFromEmail = user.email.split("@")[0].replace(/[._-]/g, " ");
      const formattedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
      supabase.from("profiles").upsert({
        id: user.uid,
        email: user.email,
        full_name: user.displayName || formattedName,
        avatar_url: user.photoURL,
      }).then(({ error }) => {
        if (error) console.error("Auto profile sync error:", error.message);
      });
    }
  }, []);
  
  // 30 minutes in milliseconds
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

  const handleLogout = async () => {
    try {
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