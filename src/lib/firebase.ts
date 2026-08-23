import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const env = (import.meta as any).env ?? {};

const REQUIRED_FIREBASE_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const missing = REQUIRED_FIREBASE_KEYS.filter((k) => !env[k]);
if (missing.length > 0) {
  const msg = `[Firebase] Missing environment variable(s): ${missing.join(", ")}. Set them in your .env file or Lovable Cloud.`;
  console.error(msg);
  throw new Error(msg);
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase without module-level throws
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
