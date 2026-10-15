import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { isSupabaseServerDown, subscribeServerDownChanges } from "@/lib/server-down-guard";
import { AlertOctagon, RefreshCw } from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" },
      { name: "theme-color", content: "#090d16" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { title: "KCT PULSE" },
      {
        name: "description",
        content:
          "KCT PULSE turns classrooms into interactive experiences with live polls, word clouds, and quizzes for Kumaraguru College of Technology.",
      },
      { name: "author", content: "KCT PULSE" },
      { property: "og:title", content: "KCT PULSE" },
      {
        property: "og:description",
        content: "Live polls, word clouds & quizzes for KCT classrooms.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://kct-classroom-flow.vercel.app/" },
      { property: "og:image", content: "https://kct-classroom-flow.vercel.app/kct-logo-opt.jpg" },
      { property: "og:site_name", content: "KCT PULSE" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "KCT PULSE" },
      {
        name: "twitter:description",
        content: "Live polls, word clouds & quizzes for KCT classrooms.",
      },
      { name: "twitter:image", content: "https://kct-classroom-flow.vercel.app/kct-logo-opt.jpg" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/user-custom-favicon.png?v=user-custom-1", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Dark-only: always add the dark class before first paint to prevent FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  document.documentElement.classList.add('dark');
                  localStorage.setItem('theme', 'dark');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { Toaster } from "@/components/ui/sonner";
import { getStoredTheme, applyTheme } from "@/components/theme-toggle";
import { autoDraftStaleSessions } from "@/lib/session-utils";
import { ChatBot } from "@/components/chat-bot";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [isServerDown, setIsServerDown] = useState(false);

  useEffect(() => {
    setIsServerDown(isSupabaseServerDown());
    const unsubscribe = subscribeServerDownChanges((enabled) => {
      setIsServerDown(enabled);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Dark-only: always enforce dark theme on mount and clear any stale light preference
    applyTheme("dark");
    document.title = "KCT PULSE";
  }, []);

  useEffect(() => {
    // Allow local debugging on localhost/127.0.0.1, but block in Lovable sandbox and production
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return;
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.key === "F12") {
        e.preventDefault();
        return false;
      }
      if (isCmdOrCtrl && e.shiftKey && key === "i") {
        e.preventDefault();
        return false;
      }
      if (isCmdOrCtrl && e.shiftKey && key === "j") {
        e.preventDefault();
        return false;
      }
      if (isCmdOrCtrl && e.shiftKey && key === "c") {
        e.preventDefault();
        return false;
      }
      if (isCmdOrCtrl && key === "u") {
        e.preventDefault();
        return false;
      }
    };

    const triggerRestriction = () => {
      // Completely wipe the DOM and display the MYCAMU-style clean message
      document.body.innerHTML = `
        <div style="display:flex; min-height:100vh; flex-direction:column; align-items:center; justify-content:center; background:#ffffff; color:#111827; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-align:center; padding:48px; box-sizing:border-box;">
          <h1 style="font-size:32px; font-weight:600; margin:0 0 12px 0; color:#1f2937; letter-spacing:-0.025em;">Developer tools are not allowed on this page.</h1>
          <p style="font-size:16px; color:#4b5563; margin:0;">Please close Developer Tools and refresh the page.</p>
        </div>
      `;

      // Stop all intervals and listeners to freeze execution in this safe state
      clearInterval(interval);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };

    const runChecks = () => {
      // Debugger timing check (highly reliable, zero false positives from scaling/zoom)
      const start = Date.now();
      /* eslint-disable-next-line no-debugger */
      debugger;
      const end = Date.now();
      if (end - start > 100) {
        triggerRestriction();
      }
    };

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);

    const interval = setInterval(runChecks, 1000);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      clearInterval(interval);
    };
  }, []);

  const showChatBot = pathname.startsWith("/dashboard");
  const isDeveloperRoute = pathname.startsWith("/developer");
  const showEmergencyServerDownScreen = isServerDown && !isDeveloperRoute;

  return (
    <QueryClientProvider client={queryClient}>
      {showEmergencyServerDownScreen ? (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#080b11] text-foreground p-6 select-none font-sans">
          <div className="max-w-md w-full glass rounded-3xl p-8 border border-rose-500/50 shadow-2xl text-center space-y-6 animate-pulse">
            <div className="h-20 w-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 grid place-items-center text-rose-500 mx-auto shadow-inner">
              <AlertOctagon className="h-10 w-10 animate-bounce" />
            </div>
            <div>
              <div className="inline-block px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-widest mb-3">
                ⚠️ CRITICAL DATABASE ALERT
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white">
                Supabase Server Down
              </h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                The database connection is currently experiencing unexpected downtime or
                maintenance.
                <strong className="block font-extrabold text-rose-400 mt-1 text-base">
                  Please contact developer!
                </strong>
              </p>
            </div>

            <div className="bg-card/60 rounded-2xl p-4 border border-border/60 text-xs font-mono space-y-1.5 text-left text-muted-foreground">
              <div>
                <span className="text-foreground font-bold">Status:</span> Offline (Maintenance)
              </div>
              <div>
                <span className="text-foreground font-bold">Campus Domain:</span> @kct.ac.in
              </div>
              <div>
                <span className="text-foreground font-bold">Developer Support:</span> Navneeth V /
                Tharun N E
              </div>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl gradient-bg text-white font-bold text-xs flex items-center gap-2 hover:opacity-90 transition shadow-lg cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" /> Check Connection Again
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster />
          {showChatBot && <ChatBot />}
        </>
      )}
    </QueryClientProvider>
  );
}
