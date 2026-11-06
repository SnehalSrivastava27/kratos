// Accounts and sessions (contracts/api.md v3): email + password, scrypt, cookie `hq_session` (stored as sha256).
import type { IncomingMessage } from "node:http";
import { scrypt, randomBytes, randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { sql } from "./store.js";

export type User = { id: string; email: string; name: string; createdAt: number };
export const COOKIE = "hq_session";
const SESSION_DAYS = 30;
const N = 2 ** 15; // scrypt cost; r=8 → 32 MiB per hash
const KEYLEN = 64;

const hashPw = (password: string, salt: Buffer) =>
  new Promise<Buffer>((ok, fail) => scrypt(password, salt, KEYLEN, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? fail(e) : ok(k))));
/** "scrypt$N$salt$hash" (base64). */
async function makePass(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${N}$${salt.toString("base64")}$${(await hashPw(password, salt)).toString("base64")}`;
}
async function checkPass(password: string, stored: string) {
  const [, , salt, hash] = stored.split("$");
  const want = Buffer.from(hash, "base64");
  const got = await hashPw(password, Buffer.from(salt, "base64"));
  return got.length === want.length && timingSafeEqual(got, want);
}
let dummy: Promise<string> | null = null; // unknown emails still pay one scrypt: no timing oracle for "exists"

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const row2user = (r: any): User => ({ id: r.id, email: r.email, name: r.name, createdAt: Number(r.created_at) });

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function normEmail(v: unknown): string {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(400, "enter a valid email");
  return email;
}
function password(v: unknown): string {
  if (typeof v !== "string" || v.length < 10 || v.length > 200) throw new AuthError(400, "password: 10 to 200 characters");
  return v;
}

export async function signup(body: any): Promise<User> {
  const email = normEmail(body.email);
  const pw = password(body.password);
  const name = typeof body.name === "string" ? body.name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 80) : "";
  const pass = await makePass(pw);
  const user = { id: `u_${randomUUID().replace(/-/g, "").slice(0, 16)}`, email, name: name || email.split("@")[0], createdAt: Date.now() };
  try {
    sql().prepare("INSERT INTO users (id, email, name, pass, created_at) VALUES (?, ?, ?, ?, ?)").run(user.id, email, user.name, pass, user.createdAt);
  } catch (e) {
    if (/UNIQUE/.test(String(e))) throw new AuthError(409, "an account with this email already exists");
    throw e;
  }
  return user;
}

export async function login(body: any): Promise<User> {
  const fail = new AuthError(401, "wrong email or password");
  let email: string;
  try {
    email = normEmail(body.email);
  } catch {
    throw fail;
  }
  const pw = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const r = sql().prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!r) {
    await checkPass(pw, await (dummy ??= makePass("not-a-real-password")));
    throw fail;
  }
  if (!(await checkPass(pw, r.pass))) throw fail;
  return row2user(r);
}

/** The host owner may run host-wide actions (re-shelving the skills library): OWNER_EMAIL, else the first user. */
export function isHostOwner(user: User) {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (owner) return user.email === owner;
  return (sql().prepare("SELECT id FROM users ORDER BY created_at, rowid LIMIT 1").get() as { id: string } | undefined)?.id === user.id;
}

/** New session for `userId`; returns the raw id for the cookie (only its hash is stored). */
export function createSession(userId: string) {
  const id = randomBytes(32).toString("base64url");
  const now = Date.now();
  sql().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  sql().prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha(id), userId, now + SESSION_DAYS * 86_400_000);
  return id;
}

/** Whether the session with this hash still exists and hasn't expired (open sockets are re-checked). */
export const sessionValid = (idHash: string) => !!sql().prepare("SELECT 1 FROM sessions WHERE id_hash = ? AND expires_at > ?").get(idHash, Date.now());

export const deleteSession = (id: string) => sql().prepare("DELETE FROM sessions WHERE id_hash = ?").run(sha(id));

export function cookieValue(req: IncomingMessage, name = COOKIE): string | null {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

/** The signed-in user of this request, or null. */
export function sessionUser(req: IncomingMessage): User | null {
  const id = cookieValue(req);
  if (!id || id.length > 100) return null;
  const r = sql().prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?").get(sha(id), Date.now());
  return r ? row2user(r) : null;
}

/** Set-Cookie for a new session (or a cleared one when `id` is null). */
export function sessionCookie(id: string | null, secure: boolean) {
  const attrs = [`${COOKIE}=${id ?? ""}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${id ? SESSION_DAYS * 86_400 : 0}`];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

/** Rate-limit key for a client address: IPv4 as is (also when IPv4-mapped), IPv6 by its /64 (one host's range). */
export function ipKey(ip: string) {
  const v4 = ip.match(/^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.split("%")[0].split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${full.slice(0, 4).map((x) => parseInt(x || "0", 16).toString(16)).join(":")}::/64`;
}

// ponytail: fixed windows in memory (single instance)
const windows = new Map<string, { n: number; reset: number }>();
function hit(key: string, max: number, ms: number) {
  const now = Date.now();
  if (windows.size > 10_000) for (const [k, v] of windows) if (now >= v.reset) windows.delete(k);
  let a = windows.get(key);
  if (!a || now >= a.reset) windows.set(key, (a = { n: 0, reset: now + ms }));
  if (++a.n > max) throw new AuthError(429, "too many attempts, try again later");
}
/** Login tries: 5 a minute per IP (IPv6: /64) + email, and 10 per 15 minutes per email from anywhere.
 *  Signup (email ""): 5 a minute per IP. Then 429. */
export function limitLogin(ip: string, email: string) {
  hit(`ip|${ipKey(ip)}|${email || "signup"}`, 5, 60_000);
  if (email) hit(`email|${email}`, 10, 15 * 60_000);
}
