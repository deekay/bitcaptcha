import { describe, it, expect } from "vitest";
import {
  verifyPreimage,
  createVerificationToken,
} from "../../src/payment/verify.js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "../../src/utils/hex.js";

describe("verifyPreimage", () => {
  it("returns true for a valid preimage/hash pair", () => {
    // Create a known preimage and compute its hash
    const preimage = "0000000000000000000000000000000000000000000000000000000000000001";
    const hash = bytesToHex(sha256(hexToBytes(preimage)));
    expect(verifyPreimage(preimage, hash)).toBe(true);
  });

  it("returns false for mismatched preimage/hash", () => {
    const preimage = "0000000000000000000000000000000000000000000000000000000000000001";
    const wrongHash = "a".repeat(64);
    expect(verifyPreimage(preimage, wrongHash)).toBe(false);
  });

  it("handles case-insensitive hash comparison", () => {
    const preimage = "0000000000000000000000000000000000000000000000000000000000000001";
    const hash = bytesToHex(sha256(hexToBytes(preimage)));
    expect(verifyPreimage(preimage, hash.toUpperCase())).toBe(true);
  });

  it("works with real-world-like preimages", () => {
    // Simulate a random 32-byte preimage
    const preimage = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const hash = bytesToHex(sha256(hexToBytes(preimage)));
    expect(verifyPreimage(preimage, hash)).toBe(true);
  });
});

describe("createVerificationToken", () => {
  it("creates a token for valid preimage/hash", () => {
    const preimage = "0000000000000000000000000000000000000000000000000000000000000001";
    const hash = bytesToHex(sha256(hexToBytes(preimage)));
    const token = createVerificationToken(preimage, hash);
    expect(token).not.toBeNull();
    expect(token!.preimage).toBe(preimage);
    expect(token!.paymentHash).toBe(hash);
    expect(token!.settledAt).toBeGreaterThan(0);
  });

  it("returns null for invalid preimage/hash", () => {
    const token = createVerificationToken("a".repeat(64), "b".repeat(64));
    expect(token).toBeNull();
  });
});
