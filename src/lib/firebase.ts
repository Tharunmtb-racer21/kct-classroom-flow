import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// SECURITY: read each public Firebase value with its own static env member expression
// (import-meta-env dot VITE_NAME). Vite then inlines only that value. Reading the whole
// env object, or indexing it with a variable key, makes Vite inline EVERY VITE_* variable
// from the build environment into the browser bundle, including any secret ones.
const REQUIRED_FIREBASE_ENV = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
} as const;

const missing = Object.entries(REQUIRED_FIREBASE_ENV)
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  const msg = `[Firebase] Missing environment variable(s): ${missing.join(", ")}. Set them in your .env file or Lovable Cloud.`;
  console.error(msg);
  throw new Error(msg);
}

const firebaseConfig = {
  apiKey: REQUIRED_FIREBASE_ENV.VITE_FIREBASE_API_KEY,
  authDomain: REQUIRED_FIREBASE_ENV.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: REQUIRED_FIREBASE_ENV.VITE_FIREBASE_PROJECT_ID,
  storageBucket: REQUIRED_FIREBASE_ENV.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: REQUIRED_FIREBASE_ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: REQUIRED_FIREBASE_ENV.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase without module-level throws
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
