#!/usr/bin/env node
/**
 * check-client-bundle-secrets.mjs
 * Scans built browser assets for leaked credentials.
 *
 * Three checks:
 *   1. Known AI credential formats, including string-reversed forms.
 *   2. Direct AI provider API hosts (the browser must call our server instead).
 *   3. Environment value leaks: every variable in the local .env* files that is NOT
 *      on the public client allowlist is searched for by value (plain and reversed).
 *      This catches any secret Vite inlined, whatever its name or format.
 *
 * Output contains only file paths, variable NAMES, and counts. Matched values are
 * never printed. Exit code 1 means a credential or env value leak was found.
 *
 * Usage:
 *   node scripts/check-client-bundle-secrets.mjs [--env-file <path>]... [--no-env] [dir ...]
 * Default directories: .vercel/output/static and dist
 * Default env files: every .env* file in the current directory.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { basename, join, relative } from "node:path";

// Public client configuration that is meant to ship in the browser bundle.
// Anything else found by value in the bundle is reported as a leak.
export const PUBLIC_CLIENT_ENV = new Set([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_MEASUREMENT_ID",
  "VITE_PUBLIC_APP_URL",
  "VITE_VERCEL_PROJECT_PRODUCTION_URL",
  "VITE_VERCEL_URL",
  "VITE_WEB3FORMS_ACCESS_KEY",
]);

// Values shorter than this are too generic to search for without false positives.
const MIN_VALUE_LENGTH = 12;

// ─── Arguments ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dirs = [];
const envFiles = [];
let useEnv = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--env-file") envFiles.push(args[++i]);
  else if (args[i] === "--no-env") useEnv = false;
  else dirs.push(args[i]);
}
if (dirs.length === 0) dirs.push(".vercel/output/static", "dist");
if (useEnv && envFiles.length === 0) {
  for (const name of readdirSync(".")) {
    if (/^\.env(\..+)?$/.test(name) && statSync(name).isFile()) envFiles.push(name);
  }
}

const reverse = (s) => s.split("").reverse().join("");

// ─── Patterns ────────────────────────────────────────────────────────────────

const credentialPatterns = {
  "groq key": /gsk_[A-Za-z0-9]{40,}/g,
  "groq key (reversed)": /[A-Za-z0-9]{40,}_ksg/g,
  "google AQ key": /AQ\.Ab[A-Za-z0-9_-]{40,}/g,
  "google AQ key (reversed)": /[A-Za-z0-9_-]{40,}bA\.QA/g,
  "nvidia key": /nvapi-[A-Za-z0-9_-]{40,}/g,
  "nvidia key (reversed)": /[A-Za-z0-9_-]{40,}-ipavn/g,
  "openai-style key": /\bsk-[A-Za-z0-9]{32,}/g,
  "supabase secret key": /sb_secret_[A-Za-z0-9_-]{20,}/g,
};

const providerHosts = {
  "api.groq.com": /api\.groq\.com/g,
  "generativelanguage.googleapis.com": /generativelanguage\.googleapis\.com/g,
  "integrate.api.nvidia.com": /integrate\.api\.nvidia\.com/g,
  "api.together.xyz": /api\.together\.xyz/g,
};

// ─── Env files ───────────────────────────────────────────────────────────────

function parseEnvFile(path) {
  const vars = [];
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars.push({ name: m[1], value: value.replace(/\\n/g, "\n").trim(), file: basename(path) });
  }
  return vars;
}

const envVars = envFiles.filter((f) => existsSync(f)).flatMap(parseEnvFile);
const publicValues = new Set(
  envVars.filter((v) => PUBLIC_CLIENT_ENV.has(v.name) && v.value).map((v) => v.value),
);
// Secret candidates: non-public names whose value is long enough and is not also a public value.
const secretCandidates = envVars.filter(
  (v) =>
    !PUBLIC_CLIENT_ENV.has(v.name) &&
    v.value.length >= MIN_VALUE_LENGTH &&
    !publicValues.has(v.value),
);
const nonPublicViteNames = [
  ...new Set(
    envVars
      .filter((v) => v.name.startsWith("VITE_") && !PUBLIC_CLIENT_ENV.has(v.name) && v.value)
      .map((v) => `${v.name} (${v.file})`),
  ),
];

// ─── Scan ────────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(m?js|css|html|json|map|txt)$/i.test(name)) out.push(p);
  }
  return out;
}

const scannedDirs = dirs.filter((d) => existsSync(d));
if (scannedDirs.length === 0) {
  console.error(`No build output found in: ${dirs.join(", ")}. Run the build first.`);
  process.exit(2);
}

let scanned = 0;
let credentialHits = 0;
let hostHits = 0;
let envLeaks = 0;

for (const dir of scannedDirs) {
  for (const file of walk(dir)) {
    scanned++;
    const text = readFileSync(file, "utf8");
    const reversedText = reverse(text);
    const rel = relative(process.cwd(), file);

    for (const [label, re] of Object.entries(credentialPatterns)) {
      const n = (text.match(re) || []).length;
      if (n > 0) {
        credentialHits += n;
        console.log(`CREDENTIAL  ${label}: ${n} match(es) in ${rel}`);
      }
    }
    for (const [host, re] of Object.entries(providerHosts)) {
      const n = (text.match(re) || []).length;
      if (n > 0) {
        hostHits += n;
        console.log(`PROVIDER HOST  ${host}: ${n} reference(s) in ${rel}`);
      }
    }
    for (const v of secretCandidates) {
      const plain = text.includes(v.value);
      const reversed = !plain && reversedText.includes(v.value);
      if (plain || reversed) {
        envLeaks++;
        console.log(
          `ENV VALUE LEAK  ${v.name} from ${v.file}${reversed ? " (reversed)" : ""} found in ${rel}`,
        );
      }
    }
  }
}

console.log(`\nScanned ${scanned} file(s) in ${scannedDirs.join(", ")}.`);
console.log(
  `Env files checked: ${envFiles.length ? envFiles.map((f) => basename(f)).join(", ") : "none"} ` +
    `(${secretCandidates.length} non-public value(s) searched)`,
);
console.log(`Credential pattern matches: ${credentialHits}`);
console.log(`Env value leaks: ${envLeaks}`);
console.log(`Direct AI provider host references: ${hostHits}`);
if (nonPublicViteNames.length > 0) {
  console.log(
    `WARNING  Non-public VITE_ variables are defined locally. Vite can expose any VITE_ ` +
      `variable to the browser; rename or remove them: ${nonPublicViteNames.join(", ")}`,
  );
}
process.exit(credentialHits > 0 || envLeaks > 0 ? 1 : 0);
