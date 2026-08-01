import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const env = (import.meta as any).env ?? {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyA-McSzNQ2_1-xdhOs214lgStDy0-DlkkY",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "kct-classroom-flow.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "kct-classroom-flow",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "kct-classroom-flow.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "847035544479",
  appId: env.VITE_FIREBASE_APP_ID || "1:847035544479:web:65e3db9342ffbb3dc703aa",
};

// Initialize Firebase without module-level throws
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
