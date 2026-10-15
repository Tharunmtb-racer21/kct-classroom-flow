/**
 * Test helpers: a locally generated RSA signing key that stands in for Google's
 * securetoken keys, and builders for Firebase-shaped ID tokens.
 * No network access and no real credentials are used.
 */

import type { PublicJwk } from "../../src/lib/firebase-token.server";

export const PROJECT_ID = "kct-test-project";
export const NOW_MS = Date.UTC(2026, 9, 13, 12, 0, 0);
export const NOW_S = Math.floor(NOW_MS / 1000);

export interface TestSigner {
  kid: string;
  privateKey: CryptoKey;
  jwk: PublicJwk;
}

export async function createSigner(kid = "test-kid-1"): Promise<TestSigner> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const exported = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return {
    kid,
    privateKey: pair.privateKey,
    jwk: { kid, kty: "RSA", alg: "RS256", use: "sig", n: exported.n!, e: exported.e! },
  };
}

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function baseClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    auth_time: NOW_S - 600,
    user_id: "uidFaculty123",
    sub: "uidFaculty123",
    iat: NOW_S - 300,
    exp: NOW_S + 3000,
    email: "faculty@kct.ac.in",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
    ...overrides,
  };
}

export async function signToken(
  signer: TestSigner,
  claims: Record<string, unknown> = baseClaims(),
  headerOverrides: Record<string, unknown> = {},
): Promise<string> {
  const header = { alg: "RS256", kid: signer.kid, typ: "JWT", ...headerOverrides };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      signer.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

/** Token with an attacker-chosen header and payload and no valid signature. */
export function unsignedToken(
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
): string {
  return `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}.${base64Url("forged")}`;
}

export interface RecordedCall {
  url: string;
  init: RequestInit;
  body: unknown;
}

export type RouteHandler = (
  url: string,
  init: RequestInit,
  body: unknown,
) => Response | Promise<Response>;

/** Fake fetch that records every call and answers through the given handler. */
export function createFakeFetch(handler: RouteHandler): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let body: unknown = undefined;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, init, body });
    return handler(url, init, body);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function completion(content: string): Response {
  return jsonResponse({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  });
}

export function headerValue(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}
