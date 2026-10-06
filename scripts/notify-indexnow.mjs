import fs from "node:fs";
import path from "node:path";

const HOST = "kct-classroom-flow.vercel.app";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";

// Strictly allowlisted public URLs only - NEVER submit private/authenticated/session routes
const ALLOWED_URLS = [
  `https://${HOST}/`,
];

function resolveKey() {
  if (process.env.INDEXNOW_KEY && /^[a-f0-9]{32,128}$/i.test(process.env.INDEXNOW_KEY.trim())) {
    return process.env.INDEXNOW_KEY.trim();
  }

  const publicDir = path.resolve("public");
  if (fs.existsSync(publicDir)) {
    const keyFiles = fs
      .readdirSync(publicDir)
      .filter((file) => /^[a-f0-9]{32,128}\.txt$/i.test(file));

    if (keyFiles.length === 1) {
      const keyFile = path.join(publicDir, keyFiles[0]);
      const content = fs.readFileSync(keyFile, "utf8").trim();
      if (content && content === keyFiles[0].replace(/\.txt$/i, "")) {
        return content;
      }
    }
  }

  throw new Error("Unable to locate a valid IndexNow key file or INDEXNOW_KEY environment variable.");
}

async function notifyIndexNow() {
  const key = resolveKey();
  const keyLocation = `https://${HOST}/${key}.txt`;

  const payload = {
    host: HOST,
    key,
    keyLocation,
    urlList: ALLOWED_URLS,
  };

  const isDryRun = process.argv.includes("--dry-run");
  if (isDryRun) {
    console.log(`[IndexNow] Dry run validated: ${ALLOWED_URLS.length} URL(s) prepared for host ${HOST}. Key verified locally.`);
    return;
  }

  console.log(`[IndexNow] Submitting ${ALLOWED_URLS.length} URL(s) for host ${HOST}...`);

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  // IndexNow API returns 200 (OK) or 202 (Accepted) on success
  if (response.status === 200 || response.status === 202) {
    console.log(`[IndexNow] Success: HTTP ${response.status} (${response.statusText || "Accepted"})`);
    return;
  }

  const responseBody = await response.text().catch(() => "");
  throw new Error(
    `[IndexNow] Submission failed with HTTP ${response.status} (${response.statusText}). Response: ${responseBody}`
  );
}

notifyIndexNow().catch((error) => {
  console.error(`[IndexNow] Error: ${error.message}`);
  process.exit(1);
});
