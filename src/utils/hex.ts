const hexes = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const j = i * 2;
    const byte = Number.parseInt(hex.slice(j, j + 2), 16);
    if (Number.isNaN(byte)) throw new Error("Invalid hex character");
    bytes[i] = byte;
  }
  return bytes;
}

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function utf8FromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
