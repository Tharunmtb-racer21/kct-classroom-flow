/**
 * Developer portal password verification utility.
 * Uses SHA-256 hashing via the Web Crypto API so the plaintext
 * password is never stored in the client-side JavaScript bundle.
 */

// SHA-256 hash of the developer panel password.
const DEV_PASSWORD_HASH = "986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7";

/**
 * Hashes a string using SHA-256 via the Web Crypto API.
 * Returns the hex-encoded digest.
 */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a candidate password against the stored SHA-256 hash.
 * Returns `true` if the password is correct, `false` otherwise.
 */
export async function verifyDevPassword(candidate: string): Promise<boolean> {
  if (!candidate || typeof candidate !== "string") return false;
  const candidateHash = await sha256(candidate.trim());
  return candidateHash === DEV_PASSWORD_HASH;
}
