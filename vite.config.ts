// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("firebase")) {
                return "firebase";
              }
              if (id.includes("recharts")) {
                return "recharts";
              }
              if (id.includes("xlsx")) {
                return "xlsx-export";
              }
              if (id.includes("jspdf") || id.includes("jspdf-autotable")) {
                return "jspdf-engine";
              }
              if (id.includes("mammoth") || id.includes("pdfjs-dist")) {
                return "pdf-docx-parsers";
              }
              if (id.includes("lucide-react")) {
                return "lucide-icons";
              }
              return "vendor";
            }
          },
        },
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Target Vercel for production builds — auto-detection also works but being
  // explicit prevents surprises if building from a non-Vercel CI.
  nitro: { preset: "vercel" },
});
