import { scrypt, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";
import type { MatchTicket } from "@gnarcadia/protocol";

const key = new TextEncoder().encode(env.JWT_SECRET);

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, saltB64, hashB64] = stored.split("$");
  if (!saltB64 || !hashB64) return false;
  const hash = await new Promise<Buffer>((res, rej) => scrypt(pw, Buffer.from(saltB64, "base64"), 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
  const expected = Buffer.from(hashB64, "base64");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

export interface AccessClaims { sub: string; roles: string[]; typ: "access" }
export async function signAccessToken(userId: string, roles: string[], ttl = "30m") {
  return new SignJWT({ roles, typ: "access" }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(ttl).sign(key);
}
export async function verifyAccessToken(jwt: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(jwt, key);
  if (payload.typ !== "access" || !payload.sub) throw new Error("bad token");
  return { sub: payload.sub, roles: (payload.roles as string[]) ?? [], typ: "access" };
}

export async function signMatchTicket(t: Omit<MatchTicket, "iat" | "exp">, ttlSec = 60 * 60 * 2) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...t, iat: now, exp: now + ttlSec }).setProtectedHeader({ alg: "HS256" }).sign(key);
}

/** HMAC for internal service-to-service calls (realtime -> api). */
export function internalSignature(body: string, ts: string) {
  return createHmac("sha256", env.INTERNAL_SECRET).update(`${ts}.${body}`).digest("hex");
}
export function verifyInternalSignature(body: string, ts: string, sig: string) {
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60_000) return false;
  const expected = internalSignature(body, ts);
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
