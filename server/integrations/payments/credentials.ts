// Pass 40 (PLAN_ROADMAP_V2.md C6.1): the provider secrets at rest. A
// payment_provider_accounts row stores the secret key and the webhook signing
// secret encrypted with AES-256-GCM under one process-level master key,
// PAYMENT_CREDENTIALS_KEY (.env; 32 bytes as 64 hex characters or base64 -
// `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
// makes one). Without the variable nothing can be saved: the Settings card
// says so and the PUT answers 503 PAYMENT_CREDENTIALS_KEY_MISSING. The key
// never leaves this module, and a stored value is decrypted only to build a
// provider adapter (storage's requirePaymentProviderTx) - never for a read.
//
// Stored form: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. The version prefix
// is what lets a later pass rotate the algorithm or the key without a
// migration that cannot tell old rows from new.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { PAYMENT_PROVIDER_ERROR_CODES } from "@shared/payment-methods";
import { PaymentProviderError } from "./types";

export const PAYMENT_CREDENTIALS_KEY_ENV = "PAYMENT_CREDENTIALS_KEY";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function loadKey(): Buffer | null {
  const raw = process.env[PAYMENT_CREDENTIALS_KEY_ENV]?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : null;
}

/** True when PAYMENT_CREDENTIALS_KEY is set and well-formed. */
export function credentialsEncryptionReady(): boolean {
  return loadKey() !== null;
}

/** "unset" / "malformed" / null when usable - for the boot warning. */
export function describeCredentialsKeyProblem(): string | null {
  const raw = process.env[PAYMENT_CREDENTIALS_KEY_ENV]?.trim();
  if (!raw) return "unset";
  return loadKey() ? null : "malformed (expected 32 bytes as 64 hex characters or base64)";
}

function requireKey(): Buffer {
  const key = loadKey();
  if (!key) {
    throw new PaymentProviderError(
      503,
      PAYMENT_PROVIDER_ERROR_CODES.ENCRYPTION_KEY_MISSING,
      `The server has no usable ${PAYMENT_CREDENTIALS_KEY_ENV}, so provider keys cannot be stored - set it in .env (32 bytes, hex or base64) and restart`,
    );
  }
  return key;
}

export function encryptCredential(plain: string): string {
  const key = requireKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptCredential(stored: string): string {
  const key = requireKey();
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new PaymentProviderError(503, PAYMENT_PROVIDER_ERROR_CODES.ENCRYPTION_KEY_MISSING, "A stored provider credential is not in a form this server can read");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new PaymentProviderError(
      503,
      PAYMENT_PROVIDER_ERROR_CODES.ENCRYPTION_KEY_MISSING,
      `A stored provider credential does not decrypt under this server's ${PAYMENT_CREDENTIALS_KEY_ENV} - the key changed; save the provider keys again`,
    );
  }
}

/** A short, non-reversible label for a secret (the first 8 hex of its SHA-256) - what the audit snapshot carries so a rotation shows as a change without the key. */
export function fingerprintCredential(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex").slice(0, 8);
}
