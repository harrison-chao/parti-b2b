import crypto from "crypto";

export function createActivationToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashActivationToken(token) };
}

export function hashActivationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function activationExpiresAt(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function buildActivationLink(token: string) {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/activate?token=${encodeURIComponent(token)}`;
}
