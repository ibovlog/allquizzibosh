// Server-only auth helpers: password hashing + signed session tokens.
// Uses Web Crypto (available in the Worker runtime).

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const STUDENT_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

export type Role = "super" | "course";
export type Session = {
  role: Role;
  // For super admin this is null unless they "enter" a course (context switch).
  courseId: string | null;
  // Base course of a course-admin (used to restrict what super's override cannot exceed for course admins).
  username?: string;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error(
      "Server misconfigured: SESSION_SECRET (or ADMIN_PASSWORD) is not set.",
    );
  }
  return secret;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toHex(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// --- Password hashing (SHA-256 + per-hash random salt) ---------------------
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt.buffer);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(saltHex + ":" + password),
  );
  return `${saltHex}:${toHex(digest)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(saltHex + ":" + password),
  );
  return timingSafeEqual(toHex(digest), hashHex);
}

// --- Session tokens --------------------------------------------------------
export async function signSession(payload: Omit<Session, "exp">): Promise<string> {
  const full: Session = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

export async function verifySession(token: string): Promise<Session> {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) throw new Error("UNAUTHORIZED");
  const expected = await hmac(body);
  if (!timingSafeEqual(sig, expected)) throw new Error("UNAUTHORIZED");
  let parsed: Session;
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    throw new Error("UNAUTHORIZED");
  }
  if (!parsed.exp || parsed.exp < Date.now()) throw new Error("SESSION_EXPIRED");
  return parsed;
}

// Re-sign a session with a new courseId override (super admin entering a course).
export async function reissueWithCourse(session: Session, courseId: string | null): Promise<string> {
  return signSession({ role: session.role, courseId, username: session.username });
}

// --- Student attempt tokens ------------------------------------------------
// Issued by joinQuiz after identity/device checks. Proves that the caller owns
// the participant / access-key row it is writing to.
export type StudentSession = {
  assessmentId: string;
  participantId: string | null;
  accessKeyId: string | null;
  exp: number;
};

export async function signStudentToken(
  payload: Omit<StudentSession, "exp">,
): Promise<string> {
  const full: StudentSession = { ...payload, exp: Date.now() + STUDENT_TTL_MS };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await hmac("student:" + body);
  return `${body}.${sig}`;
}

export async function verifyStudentToken(token: string): Promise<StudentSession> {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) throw new Error("UNAUTHORIZED");
  const expected = await hmac("student:" + body);
  if (!timingSafeEqual(sig, expected)) throw new Error("UNAUTHORIZED");
  let parsed: StudentSession;
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    throw new Error("UNAUTHORIZED");
  }
  if (!parsed.exp || parsed.exp < Date.now()) throw new Error("SESSION_EXPIRED");
  return parsed;
}
