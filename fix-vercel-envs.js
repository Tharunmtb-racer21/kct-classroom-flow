import { execSync } from 'child_process';
const pushEnv = (key, val) => {
  try { execSync(`npx vercel env rm ${key} production -y`, { stdio: 'ignore' }); } catch(e){}
  execSync(`npx vercel env add ${key} production`, { input: val });
  console.log(`Added ${key}`);
};

// Supabase
pushEnv('VITE_SUPABASE_URL', 'https://zojnzycfwstyubqinztd.supabase.co');
pushEnv('VITE_SUPABASE_PROJECT_ID', 'zojnzycfwstyubqinztd');
pushEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_uoMpgz1BZW2WocmeNWXg4A_bNQACBlD');

// Firebase
pushEnv('VITE_FIREBASE_API_KEY', 'AIzaSyA-McSzNQ2_1-xdhOs214lgStDy0-DlkkY');
pushEnv('VITE_FIREBASE_AUTH_DOMAIN', 'kct-classroom-flow.firebaseapp.com');
pushEnv('VITE_FIREBASE_PROJECT_ID', 'kct-classroom-flow');
pushEnv('VITE_FIREBASE_STORAGE_BUCKET', 'kct-classroom-flow.firebasestorage.app');
pushEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '847035544479');
pushEnv('VITE_FIREBASE_APP_ID', '1:847035544479:web:65e3db9342ffbb3dc703aa');
pushEnv('VITE_FIREBASE_MEASUREMENT_ID', 'G-2BWHHYKGMT');

console.log('Fixed env vars!');
console.log('NOTE: Vercel auto-provides VERCEL_PROJECT_PRODUCTION_URL and VERCEL_URL.');
console.log('The .env bridges them as VITE_VERCEL_PROJECT_PRODUCTION_URL / VITE_VERCEL_URL');
console.log('so the QR code will automatically point to your production domain.');
