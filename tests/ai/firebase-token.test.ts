import { beforeAll, describe, expect, test } from "bun:test";
import {
  AuthError,
  GOOGLE_SECURETOKEN_JWKS_URL,
  assertKctFaculty,
  createGoogleJwksProvider,
  extractBearerToken,
  resolveFirebaseProjectId,
  verifyFirebaseIdToken,
  type FirebaseIdentity,
  type PublicJwk,
} from "../../src/lib/firebase-token.server";
import {
  NOW_MS,
  NOW_S,
  PROJECT_ID,
  baseClaims,
  createFakeFetch,
  createSigner,
  jsonResponse,
  signToken,
  unsignedToken,
  type TestSigner,
} from "./helpers";

let signer: TestSigner;
let otherSigner: TestSigner;

beforeAll(async () => {
  signer = await createSigner("kid-good");
  otherSigner = await createSigner("kid-other");
});

function opts(keys: PublicJwk[] = [signer.jwk]) {
  let forced = 0;
  return {
    projectId: PROJECT_ID,
    now: () => NOW_MS,
    getKeys: async (o?: { forceRefresh?: boolean }) => {
      if (o?.forceRefresh) forced++;
      return keys;
    },
    get forced() {
      return forced;
    },
  };
}

async function expectAuthError(promise: Promise<unknown>, status: number, code?: string) {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).status).toBe(status as 401);
    if (code) expect((err as AuthError).code).toBe(code as AuthError["code"]);
    return;
  }
  throw new Error("expected AuthError");
}

describe("extractBearerToken", () => {
  test("rejects a missing header", () => {
    expect(() => extractBearerToken(undefined)).toThrow(AuthError);
    expect(() => extractBearerToken("")).toThrow("Authentication required.");
  });

  test("rejects non-bearer schemes and malformed tokens", () => {
    expect(() => extractBearerToken("Basic abc")).toThrow(AuthError);
    expect(() => extractBearerToken("Bearer not-a-jwt")).toThrow(AuthError);
    expect(() => extractBearerToken("Bearer a.b.c d")).toThrow(AuthError);
    expect(() => extractBearerToken(`Bearer ${"a".repeat(5000)}.b.c`)).toThrow(AuthError);
  });

  test("accepts a well-formed bearer token", () => {
    expect(extractBearerToken("Bearer aaa.bbb.ccc")).toBe("aaa.bbb.ccc");
  });
});

describe("verifyFirebaseIdToken", () => {
  test("accepts a correctly signed, current token", async () => {
    const token = await signToken(signer);
    const identity = await verifyFirebaseIdToken(token, opts());
    expect(identity.uid).toBe("uidFaculty123");
    expect(identity.email).toBe("faculty@kct.ac.in");
    expect(identity.emailVerified).toBe(true);
  });

  test("rejects a token signed by an unknown key even when the kid matches", async () => {
    const forged = await signToken({ ...otherSigner, kid: signer.kid });
    await expectAuthError(verifyFirebaseIdToken(forged, opts()), 401, "invalid_signature");
  });

  test("rejects a token whose payload was altered after signing", async () => {
    const token = await signToken(signer);
    const [h, , s] = token.split(".");
    const tamperedPayload = (
      await signToken(signer, baseClaims({ email: "attacker@kct.ac.in" }))
    ).split(".")[1];
    await expectAuthError(
      verifyFirebaseIdToken(`${h}.${tamperedPayload}.${s}`, opts()),
      401,
      "invalid_signature",
    );
  });

  test("rejects alg none and HS256 tokens", async () => {
    await expectAuthError(
      verifyFirebaseIdToken(unsignedToken({ alg: "none", kid: signer.kid }, baseClaims()), opts()),
      401,
      "unsupported_algorithm",
    );
    await expectAuthError(
      verifyFirebaseIdToken(unsignedToken({ alg: "HS256", kid: signer.kid }, baseClaims()), opts()),
      401,
      "unsupported_algorithm",
    );
  });

  test("rejects an unknown kid after one forced key refresh", async () => {
    const token = await signToken(otherSigner);
    const o = opts();
    await expectAuthError(verifyFirebaseIdToken(token, o), 401, "unknown_key");
    expect(o.forced).toBe(1);
  });

  test("rejects expired tokens", async () => {
    const token = await signToken(signer, baseClaims({ exp: NOW_S - 120 }));
    await expectAuthError(verifyFirebaseIdToken(token, opts()), 401, "expired");
  });

  test("rejects tokens issued in the future", async () => {
    const token = await signToken(signer, baseClaims({ iat: NOW_S + 600 }));
    await expectAuthError(verifyFirebaseIdToken(token, opts()), 401, "not_yet_valid");
    const authTime = await signToken(signer, baseClaims({ auth_time: NOW_S + 600 }));
    await expectAuthError(verifyFirebaseIdToken(authTime, opts()), 401, "not_yet_valid");
  });

  test("rejects tokens for another Firebase project", async () => {
    const wrongAud = await signToken(signer, baseClaims({ aud: "other-project" }));
    await expectAuthError(verifyFirebaseIdToken(wrongAud, opts()), 401, "invalid_audience");
    const wrongIss = await signToken(
      signer,
      baseClaims({ iss: "https://securetoken.google.com/other-project" }),
    );
    await expectAuthError(verifyFirebaseIdToken(wrongIss, opts()), 401, "invalid_issuer");
  });

  test("rejects empty or oversized subjects", async () => {
    const empty = await signToken(signer, baseClaims({ sub: "" }));
    await expectAuthError(verifyFirebaseIdToken(empty, opts()), 401, "invalid_subject");
    const long = await signToken(signer, baseClaims({ sub: "x".repeat(129) }));
    await expectAuthError(verifyFirebaseIdToken(long, opts()), 401, "invalid_subject");
  });

  test("rejects malformed tokens", async () => {
    await expectAuthError(verifyFirebaseIdToken("a.b", opts()), 401, "malformed_token");
    await expectAuthError(verifyFirebaseIdToken("!!!.???.***", opts()), 401, "malformed_token");
  });

  test("fails closed when the project ID is not configured", async () => {
    const token = await signToken(signer);
    await expectAuthError(
      verifyFirebaseIdToken(token, { ...opts(), projectId: "" }),
      503,
      "misconfigured",
    );
  });
});

describe("assertKctFaculty", () => {
  const identity = (email: string | null, emailVerified = true): FirebaseIdentity => ({
    uid: "u1",
    email,
    emailVerified,
    claims: {},
  });

  test("accepts a verified @kct.ac.in address, case-insensitively", () => {
    expect(() => assertKctFaculty(identity("faculty@kct.ac.in"))).not.toThrow();
    expect(() => assertKctFaculty(identity("Faculty@KCT.AC.IN"))).not.toThrow();
  });

  test("rejects other domains, subdomains and look-alikes with 403", () => {
    for (const email of [
      "someone@gmail.com",
      "someone@sub.kct.ac.in",
      "someone@kct.ac.in.evil.com",
      "someone@evilkct.ac.in",
      "a@b@kct.ac.in",
      "@kct.ac.in",
    ]) {
      try {
        assertKctFaculty(identity(email));
        throw new Error(`accepted ${email}`);
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).status).toBe(403);
      }
    }
  });

  test("rejects unverified and missing emails", () => {
    expect(() => assertKctFaculty(identity("faculty@kct.ac.in", false))).toThrow("verify");
    expect(() => assertKctFaculty(identity(null))).toThrow(AuthError);
  });
});

describe("createGoogleJwksProvider", () => {
  test("fetches Google's securetoken JWKS and caches it for max-age", async () => {
    let now = NOW_MS;
    const { fetchImpl, calls } = createFakeFetch(() =>
      jsonResponse({ keys: [signer.jwk] }, 200, { "cache-control": "public, max-age=300" }),
    );
    const provider = createGoogleJwksProvider(fetchImpl, () => now);
    expect((await provider())[0].kid).toBe("kid-good");
    await provider();
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe(GOOGLE_SECURETOKEN_JWKS_URL);
    now += 301_000;
    await provider();
    expect(calls.length).toBe(2);
  });

  test("limits forced refreshes to once per minute", async () => {
    let now = NOW_MS;
    const { fetchImpl, calls } = createFakeFetch(() =>
      jsonResponse({ keys: [signer.jwk] }, 200, { "cache-control": "max-age=3600" }),
    );
    const provider = createGoogleJwksProvider(fetchImpl, () => now);
    await provider();
    await provider({ forceRefresh: true });
    expect(calls.length).toBe(1);
    now += 61_000;
    await provider({ forceRefresh: true });
    expect(calls.length).toBe(2);
  });

  test("returns 503 when keys cannot be loaded and nothing is cached", async () => {
    const { fetchImpl } = createFakeFetch(() => new Response("down", { status: 500 }));
    const provider = createGoogleJwksProvider(fetchImpl, () => NOW_MS);
    await expectAuthError(provider(), 503, "keys_unavailable");
  });
});

describe("resolveFirebaseProjectId", () => {
  test("prefers the server variable and falls back to the public Vite variable", () => {
    expect(
      resolveFirebaseProjectId({ FIREBASE_PROJECT_ID: "a", VITE_FIREBASE_PROJECT_ID: "b" }),
    ).toBe("a");
    expect(resolveFirebaseProjectId({ VITE_FIREBASE_PROJECT_ID: "b" })).toBe("b");
    expect(resolveFirebaseProjectId({})).toBe("");
  });
});
