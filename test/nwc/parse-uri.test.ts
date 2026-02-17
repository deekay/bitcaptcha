import { describe, it, expect } from "vitest";
import { parseNwcUri } from "../../src/nwc/parse-uri.js";

describe("parseNwcUri", () => {
  const validPubkey = "a".repeat(64);
  const validSecret = "b".repeat(64);
  const validRelay = "wss://relay.example.com";

  it("parses a valid NWC URI", () => {
    const uri = `nostr+walletconnect://${validPubkey}?relay=${encodeURIComponent(validRelay)}&secret=${validSecret}`;
    const result = parseNwcUri(uri);
    expect(result.walletPubkey).toBe(validPubkey);
    expect(result.relayUrl).toBe(validRelay);
    expect(result.secret).toBe(validSecret);
  });

  it("trims whitespace", () => {
    const uri = `  nostr+walletconnect://${validPubkey}?relay=${encodeURIComponent(validRelay)}&secret=${validSecret}  `;
    const result = parseNwcUri(uri);
    expect(result.walletPubkey).toBe(validPubkey);
  });

  it("lowercases pubkey and secret", () => {
    const upperPubkey = "A".repeat(64);
    const upperSecret = "B".repeat(64);
    const uri = `nostr+walletconnect://${upperPubkey}?relay=${encodeURIComponent(validRelay)}&secret=${upperSecret}`;
    const result = parseNwcUri(uri);
    expect(result.walletPubkey).toBe(validPubkey);
    expect(result.secret).toBe(validSecret);
  });

  it("handles mixed case in params", () => {
    const mixedPubkey = "aAbBcCdDeEfF".repeat(5) + "aAbB";
    const uri = `nostr+walletconnect://${mixedPubkey}?relay=${encodeURIComponent(validRelay)}&secret=${validSecret}`;
    const result = parseNwcUri(uri);
    expect(result.walletPubkey).toBe(mixedPubkey.toLowerCase());
  });

  it("rejects missing prefix", () => {
    expect(() => parseNwcUri(`https://${validPubkey}?relay=${validRelay}&secret=${validSecret}`)).toThrow(
      "must start with",
    );
  });

  it("rejects missing query parameters", () => {
    expect(() => parseNwcUri(`nostr+walletconnect://${validPubkey}`)).toThrow(
      "missing query parameters",
    );
  });

  it("rejects invalid pubkey length", () => {
    expect(() =>
      parseNwcUri(`nostr+walletconnect://abc?relay=${validRelay}&secret=${validSecret}`),
    ).toThrow("64 hex characters");
  });

  it("rejects missing relay", () => {
    expect(() =>
      parseNwcUri(`nostr+walletconnect://${validPubkey}?secret=${validSecret}`),
    ).toThrow("missing relay");
  });

  it("rejects non-websocket relay", () => {
    expect(() =>
      parseNwcUri(`nostr+walletconnect://${validPubkey}?relay=https://example.com&secret=${validSecret}`),
    ).toThrow("WebSocket URL");
  });

  it("rejects missing secret", () => {
    expect(() =>
      parseNwcUri(`nostr+walletconnect://${validPubkey}?relay=${encodeURIComponent(validRelay)}`),
    ).toThrow("missing secret");
  });

  it("rejects invalid secret length", () => {
    expect(() =>
      parseNwcUri(`nostr+walletconnect://${validPubkey}?relay=${encodeURIComponent(validRelay)}&secret=abc`),
    ).toThrow("64 hex characters");
  });

  it("accepts ws:// relay URLs", () => {
    const uri = `nostr+walletconnect://${validPubkey}?relay=ws://localhost:7777&secret=${validSecret}`;
    const result = parseNwcUri(uri);
    expect(result.relayUrl).toBe("ws://localhost:7777");
  });
});
