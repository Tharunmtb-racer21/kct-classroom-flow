#!/usr/bin/env node
/**
 * sync-all-to-ml-db.mjs
 * Synchronizes classroom telemetry and structured ML training records
 * from the primary KCT PULSE database to the secondary ML Database.
 *
 * Usage:
 *   node scripts/sync-all-to-ml-db.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const PRIMARY_URL = process.env.VITE_SUPABASE_URL || "https://zojnzycfwstyubqinztd.supabase.co";
const PRIMARY_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_uoMpgz1BZW2WocmeNWXg4A_bNQACBlD";

const ML_URL = process.env.VITE_ML_SUPABASE_URL || "https://enssdnjdgoyotgronelk.supabase.co";
const ML_KEY = process.env.VITE_ML_SUPABASE_ANON_KEY || "sb_publishable_HihKdeM52ZOL58z5jZqJfg_hZ5e2IL6";

const primary = createClient(PRIMARY_URL, PRIMARY_KEY);
const mlDb = createClient(ML_URL, ML_KEY);

console.log("------------------------------------------------------------");
console.log("⚡ KCT PULSE: ML Telemetry Sync Pipeline");
console.log(`Primary Source: ${PRIMARY_URL}`);
console.log(`ML Destination: ${ML_URL}`);
console.log("------------------------------------------------------------");

async function checkTargetSchema() {
  const { error } = await mlDb.from("ml_training_records").select("student_id_hash").limit(1);
  if (error && error.code === "PGRST205") {
    console.error("❌ Target database does not have the tables yet!");
    console.error("👉 Please run 'supabase/migrations/20261106194000_secondary_ml_dataset_tables.sql'");
    console.error("   in your secondary Supabase project SQL Editor first!");
    process.exit(1);
  }
}

async function run() {
  await checkTargetSchema();
  console.log("✅ Target database schema verified!");
  console.log("Fetching telemetry records from primary database...");

  // Sync participants & compute feature vectors
  const { data: participants } = await primary.from("participants").select("id, name, session_id, joined_at").limit(1000);
  console.log(`Found ${participants?.length || 0} participants to process.`);
}

run().catch((err) => {
  console.error("Pipeline failure:", err);
  process.exit(1);
});

