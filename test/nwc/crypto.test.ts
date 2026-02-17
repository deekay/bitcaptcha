import { describe, it, expect } from "vitest";
import {
  getConversationKey,
  calcPaddedLen,
  nip44Encrypt,
  nip44Decrypt,
  computeEventId,
  getPublicKey,
} from "../../src/nwc/crypto.js";
import { hexToBytes } from "../../src/utils/hex.js";

describe("NIP-44 crypto", () => {
  describe("getConversationKey", () => {
    // Official test vectors from paulmillr/nip44
    const vectors = [
      {
        sec1: "315e59ff51cb9209768cf7da80791ddcaae56ac9775eb25b6dee1234bc5d2268",
        pub2: "c2f9d9948dc8c7c38321e4b85c8558872eafa0641cd269db76848a6073e69133",
        conversationKey:
          "3dfef0ce2a4d80a25e7a328accf73448ef67096f65f79588e358d9a0eb9013f1",
      },
      {
        sec1: "a1e37752c9fdc1273be53f68c5f74be7c8905728e8de75800b94262f9497c86e",
        pub2: "03bb7947065dde12ba991ea045132581d0954f042c84e06d8c00066e23c1a800",
        conversationKey:
          "4d14f36e81b8452128da64fe6f1eae873baae2f444b02c950b90e43553f2178b",
      },
      {
        sec1: "98a5902fd67518a0c900f0fb62158f278f94a21d6f9d33d30cd3091195500311",
        pub2: "aae65c15f98e5e677b5050de82e3aba47a6fe49b3dab7863cf35d9478ba9f7d1",
        conversationKey:
          "9c00b769d5f54d02bf175b7284a1cbd28b6911b06cda6666b2243561ac96bad7",
      },
      {
        sec1: "86ae5ac8034eb2542ce23ec2f84375655dab7f836836bbd3c54cefe9fdc9c19f",
        pub2: "59f90272378089d73f1339710c02e2be6db584e9cdbe86eed3578f0c67c23585",
        conversationKey:
          "19f934aafd3324e8415299b64df42049afaa051c71c98d0aa10e1081f2e3e2ba",
      },
      {
        sec1: "2528c287fe822421bc0dc4c3615878eb98e8a8c31657616d08b29c00ce209e34",
        pub2: "f66ea16104c01a1c532e03f166c5370a22a5505753005a566366097150c6df60",
        conversationKey:
          "c833bbb292956c43366145326d53b955ffb5da4e4998a2d853611841903f5442",
      },
    ];

    vectors.forEach((v, i) => {
      it(`derives correct conversation key (vector ${i + 1})`, () => {
        const key = getConversationKey(v.sec1, v.pub2);
        expect(Buffer.from(key).toString("hex")).toBe(v.conversationKey);
      });
    });

    it("is symmetric (same key regardless of who initiates)", () => {
      const sec1 =
        "315e59ff51cb9209768cf7da80791ddcaae56ac9775eb25b6dee1234bc5d2268";
      const pub1 = getPublicKey(sec1);
      const sec2 =
        "a1e37752c9fdc1273be53f68c5f74be7c8905728e8de75800b94262f9497c86e";
      const pub2 = getPublicKey(sec2);
      const key1 = getConversationKey(sec1, pub2);
      const key2 = getConversationKey(sec2, pub1);
      expect(Buffer.from(key1).toString("hex")).toBe(
        Buffer.from(key2).toString("hex"),
      );
    });
  });

  describe("calcPaddedLen", () => {
    const vectors: [number, number][] = [
      [1, 32],
      [16, 32],
      [32, 32],
      [33, 64],
      [37, 64],
      [45, 64],
      [49, 64],
      [64, 64],
      [65, 96],
      [100, 128],
      [111, 128],
      [200, 224],
      [250, 256],
      [320, 320],
      [383, 384],
      [384, 384],
      [400, 448],
      [500, 512],
      [512, 512],
      [515, 640],
      [700, 768],
      [800, 896],
      [900, 1024],
      [1020, 1024],
      [65535, 65536],
    ];

    vectors.forEach(([input, expected]) => {
      it(`calcPaddedLen(${input}) = ${expected}`, () => {
        expect(calcPaddedLen(input)).toBe(expected);
      });
    });
  });

  describe("encrypt/decrypt round-trip", () => {
    it("encrypts and decrypts a simple message", () => {
      const sec1 =
        "315e59ff51cb9209768cf7da80791ddcaae56ac9775eb25b6dee1234bc5d2268";
      const sec2 =
        "a1e37752c9fdc1273be53f68c5f74be7c8905728e8de75800b94262f9497c86e";
      const pub2 = getPublicKey(sec2);
      const convKey = getConversationKey(sec1, pub2);

      const plaintext = "Hello, NIP-44!";
      const encrypted = nip44Encrypt(plaintext, convKey);
      const decrypted = nip44Decrypt(encrypted, convKey);
      expect(decrypted).toBe(plaintext);
    });

    it("works with emoji", () => {
      const sec1 =
        "0000000000000000000000000000000000000000000000000000000000000001";
      const sec2 =
        "0000000000000000000000000000000000000000000000000000000000000002";
      const pub2 = getPublicKey(sec2);
      const convKey = getConversationKey(sec1, pub2);

      const plaintext = "\u{1F355}\u{1FAC3}"; // pizza + pregnant man emoji
      const encrypted = nip44Encrypt(plaintext, convKey);
      const decrypted = nip44Decrypt(encrypted, convKey);
      expect(decrypted).toBe(plaintext);
    });

    it("works with CJK characters", () => {
      const sec1 =
        "315e59ff51cb9209768cf7da80791ddcaae56ac9775eb25b6dee1234bc5d2268";
      const sec2 =
        "a1e37752c9fdc1273be53f68c5f74be7c8905728e8de75800b94262f9497c86e";
      const pub2 = getPublicKey(sec2);
      const convKey = getConversationKey(sec1, pub2);

      const plaintext = "\u8868\u30DD\u3042A\u9D17OE\u0065B\u900D";
      const encrypted = nip44Encrypt(plaintext, convKey);
      const decrypted = nip44Decrypt(encrypted, convKey);
      expect(decrypted).toBe(plaintext);
    });

    it("works with long messages", () => {
      const sec1 =
        "0000000000000000000000000000000000000000000000000000000000000001";
      const sec2 =
        "0000000000000000000000000000000000000000000000000000000000000002";
      const pub2 = getPublicKey(sec2);
      const convKey = getConversationKey(sec1, pub2);

      const plaintext = "x".repeat(1024);
      const encrypted = nip44Encrypt(plaintext, convKey);
      const decrypted = nip44Decrypt(encrypted, convKey);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("encrypt with known nonce (test vectors)", () => {
    it("vector 1: single char 'a'", () => {
      const convKey = hexToBytes(
        "c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d",
      );
      const nonce = hexToBytes(
        "0000000000000000000000000000000000000000000000000000000000000001",
      );
      const encrypted = nip44Encrypt("a", convKey, nonce);
      expect(encrypted).toBe(
        "AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABee0G5VSK0/9YypIObAtDKfYEAjD35uVkHyB0F4DwrcNaCXlCWZKaArsGrY6M9wnuTMxWfp1RTN9Xga8no+kF5Vsb",
      );
    });

    it("decrypts vector 1 correctly", () => {
      const convKey = hexToBytes(
        "c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d",
      );
      const payload =
        "AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABee0G5VSK0/9YypIObAtDKfYEAjD35uVkHyB0F4DwrcNaCXlCWZKaArsGrY6M9wnuTMxWfp1RTN9Xga8no+kF5Vsb";
      expect(nip44Decrypt(payload, convKey)).toBe("a");
    });
  });

  describe("invalid decrypt", () => {
    it("rejects empty payload", () => {
      const convKey = hexToBytes("a".repeat(64));
      expect(() => nip44Decrypt("", convKey)).toThrow("Unknown version");
    });

    it("rejects payload starting with #", () => {
      const convKey = hexToBytes("a".repeat(64));
      expect(() => nip44Decrypt("#" + "a".repeat(200), convKey)).toThrow(
        "Unknown version",
      );
    });

    it("rejects too-short payload", () => {
      const convKey = hexToBytes("a".repeat(64));
      expect(() => nip44Decrypt("AAAA", convKey)).toThrow(
        "Invalid payload size",
      );
    });
  });

  describe("computeEventId", () => {
    it("computes deterministic event ID", () => {
      const event = {
        pubkey:
          "a".repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: "hello",
      };
      const id1 = computeEventId(event);
      const id2 = computeEventId(event);
      expect(id1).toBe(id2);
      expect(id1).toHaveLength(64);
    });
  });
});
