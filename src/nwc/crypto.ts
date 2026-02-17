import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha256";
import { hmac } from "@noble/hashes/hmac";
import { extract, expand } from "@noble/hashes/hkdf";
import { chacha20 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/hashes/utils";
import { hexToBytes, bytesToHex, utf8ToBytes } from "../utils/hex.js";
import type { UnsignedEvent, NostrEvent } from "./types.js";

// --- Conversation Key (ECDH + HKDF-Extract) ---

const NIP44_SALT = utf8ToBytes("nip44-v2");

export function getConversationKey(
  privateKeyHex: string,
  publicKeyHex: string,
): Uint8Array {
  // ECDH: get shared point, extract x-coordinate (bytes 1..33 of compressed point)
  const sharedPoint = secp256k1.getSharedSecret(
    hexToBytes(privateKeyHex),
    hexToBytes("02" + publicKeyHex),
  );
  const sharedX = sharedPoint.slice(1, 33);
  // HKDF-Extract only: salt="nip44-v2", IKM=sharedX → 32-byte conversation key
  return extract(sha256, sharedX, NIP44_SALT);
}

// --- Message Keys (HKDF-Expand) ---

interface MessageKeys {
  chachaKey: Uint8Array; // 32 bytes
  chaChaNonce: Uint8Array; // 12 bytes
  hmacKey: Uint8Array; // 32 bytes
}

function getMessageKeys(
  conversationKey: Uint8Array,
  nonce: Uint8Array,
): MessageKeys {
  if (conversationKey.length !== 32)
    throw new Error("Invalid conversation key length");
  if (nonce.length !== 32) throw new Error("Invalid nonce length");

  // HKDF-Expand: PRK=conversationKey, info=nonce, L=76
  const keys = expand(sha256, conversationKey, nonce, 76);
  return {
    chachaKey: keys.slice(0, 32),
    chaChaNonce: keys.slice(32, 44),
    hmacKey: keys.slice(44, 76),
  };
}

// --- Padding ---

export function calcPaddedLen(unpaddedLen: number): number {
  if (unpaddedLen <= 0) throw new Error("Invalid plaintext length");
  if (unpaddedLen <= 32) return 32;
  const nextPower = 1 << (Math.floor(Math.log2(unpaddedLen - 1)) + 1);
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((unpaddedLen - 1) / chunk) + 1);
}

function pad(plaintext: string): Uint8Array {
  const unpadded = utf8ToBytes(plaintext);
  const unpaddedLen = unpadded.length;
  if (unpaddedLen < 1 || unpaddedLen > 65535)
    throw new Error("Invalid plaintext length");
  const paddedLen = calcPaddedLen(unpaddedLen);
  const result = new Uint8Array(2 + paddedLen);
  // Big-endian uint16 length prefix
  result[0] = (unpaddedLen >> 8) & 0xff;
  result[1] = unpaddedLen & 0xff;
  result.set(unpadded, 2);
  // Remaining bytes are already zero
  return result;
}

function unpad(padded: Uint8Array): string {
  const unpaddedLen = (padded[0] << 8) | padded[1];
  if (
    unpaddedLen === 0 ||
    unpaddedLen > padded.length - 2 ||
    padded.length !== 2 + calcPaddedLen(unpaddedLen)
  ) {
    throw new Error("Invalid padding");
  }
  const unpadded = padded.slice(2, 2 + unpaddedLen);
  return new TextDecoder().decode(unpadded);
}

// --- HMAC-AAD ---

function hmacAad(
  key: Uint8Array,
  message: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  if (aad.length !== 32) throw new Error("AAD must be 32 bytes");
  const data = new Uint8Array(aad.length + message.length);
  data.set(aad);
  data.set(message, aad.length);
  return hmac(sha256, key, data);
}

// --- Encrypt / Decrypt ---

export function nip44Encrypt(
  plaintext: string,
  conversationKey: Uint8Array,
  nonce?: Uint8Array,
): string {
  if (!nonce) nonce = randomBytes(32);
  const { chachaKey, chaChaNonce, hmacKey } = getMessageKeys(
    conversationKey,
    nonce,
  );
  const padded = pad(plaintext);
  const ciphertext = chacha20(chachaKey, chaChaNonce, padded);
  const mac = hmacAad(hmacKey, ciphertext, nonce);

  // Wire format: version(1) + nonce(32) + ciphertext(var) + mac(32)
  const payload = new Uint8Array(1 + 32 + ciphertext.length + 32);
  payload[0] = 2; // version
  payload.set(nonce, 1);
  payload.set(ciphertext, 33);
  payload.set(mac, 33 + ciphertext.length);

  return btoa(String.fromCharCode(...payload));
}

export function nip44Decrypt(
  payload: string,
  conversationKey: Uint8Array,
): string {
  const plen = payload.length;
  if (plen === 0 || payload[0] === "#") throw new Error("Unknown version");
  if (plen < 132 || plen > 87472) throw new Error("Invalid payload size");

  const data = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const dlen = data.length;
  if (dlen < 99 || dlen > 65603) throw new Error("Invalid data size");
  if (data[0] !== 2) throw new Error("Unknown version " + data[0]);

  const nonce = data.slice(1, 33);
  const ciphertext = data.slice(33, dlen - 32);
  const mac = data.slice(dlen - 32);

  const { chachaKey, chaChaNonce, hmacKey } = getMessageKeys(
    conversationKey,
    nonce,
  );

  const calculatedMac = hmacAad(hmacKey, ciphertext, nonce);
  if (!constantTimeEqual(calculatedMac, mac)) throw new Error("Invalid MAC");

  const padded = chacha20(chachaKey, chaChaNonce, ciphertext);
  return unpad(padded);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// --- Nostr Event Signing ---

export function computeEventId(event: UnsignedEvent): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return bytesToHex(sha256(utf8ToBytes(serialized)));
}

export async function signEvent(
  event: UnsignedEvent,
  privateKeyHex: string,
): Promise<NostrEvent> {
  const id = computeEventId(event);
  const sig = bytesToHex(await schnorr.sign(hexToBytes(id), hexToBytes(privateKeyHex)));
  return { ...event, id, sig };
}

export function getPublicKey(privateKeyHex: string): string {
  return bytesToHex(schnorr.getPublicKey(hexToBytes(privateKeyHex)));
}

export { sha256, randomBytes };
