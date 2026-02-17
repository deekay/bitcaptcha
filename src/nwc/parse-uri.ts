import type { NwcConnectionParams } from "./types.js";

/**
 * Parse a nostr+walletconnect:// URI into connection parameters.
 *
 * Format: nostr+walletconnect://<walletPubkey>?relay=<relayUrl>&secret=<secretHex>
 *
 * Also accepts the legacy "nostr+walletconnect://" prefix variants.
 */
export function parseNwcUri(uri: string): NwcConnectionParams {
  const trimmed = uri.trim();

  // Accept both nostr+walletconnect:// and nostr+walletconnect:
  const prefix = "nostr+walletconnect://";
  if (!trimmed.toLowerCase().startsWith(prefix)) {
    throw new Error(
      `Invalid NWC URI: must start with "${prefix}"`,
    );
  }

  const rest = trimmed.slice(prefix.length);
  const questionIdx = rest.indexOf("?");

  if (questionIdx === -1) {
    throw new Error("Invalid NWC URI: missing query parameters");
  }

  const walletPubkey = rest.slice(0, questionIdx);
  if (!/^[0-9a-f]{64}$/i.test(walletPubkey)) {
    throw new Error(
      "Invalid NWC URI: wallet pubkey must be 64 hex characters",
    );
  }

  const params = new URLSearchParams(rest.slice(questionIdx + 1));

  const relayUrl = params.get("relay");
  if (!relayUrl) {
    throw new Error("Invalid NWC URI: missing relay parameter");
  }
  if (!relayUrl.startsWith("wss://") && !relayUrl.startsWith("ws://")) {
    throw new Error("Invalid NWC URI: relay must be a WebSocket URL");
  }

  const secret = params.get("secret");
  if (!secret) {
    throw new Error("Invalid NWC URI: missing secret parameter");
  }
  if (!/^[0-9a-f]{64}$/i.test(secret)) {
    throw new Error(
      "Invalid NWC URI: secret must be 64 hex characters",
    );
  }

  return {
    walletPubkey: walletPubkey.toLowerCase(),
    relayUrl,
    secret: secret.toLowerCase(),
  };
}
