import { sha256 } from "@noble/hashes/sha256";
import { hexToBytes, bytesToHex } from "../utils/hex.js";

export interface VerificationToken {
  paymentHash: string;
  preimage: string;
  settledAt: number;
}

/**
 * Verify that SHA256(preimage) === paymentHash.
 * This is the client-side verification — confirms the payer knows the preimage.
 */
export function verifyPreimage(
  preimage: string,
  paymentHash: string,
): boolean {
  const preimageBytes = hexToBytes(preimage);
  const computedHash = bytesToHex(sha256(preimageBytes));
  return computedHash === paymentHash.toLowerCase();
}

/**
 * Create a verification token from a settled invoice.
 */
export function createVerificationToken(
  preimage: string,
  paymentHash: string,
): VerificationToken | null {
  if (!verifyPreimage(preimage, paymentHash)) return null;
  return {
    paymentHash,
    preimage,
    settledAt: Math.floor(Date.now() / 1000),
  };
}
