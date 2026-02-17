import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NwcClient } from "../../src/nwc/client.js";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helper: simulate receiving a message
  receiveMessage(data: string) {
    this.onmessage?.({ data });
  }
}

const validPubkey = "a".repeat(64);
const validSecret = "0000000000000000000000000000000000000000000000000000000000000001";
const validRelay = "wss://relay.example.com";
const validUri = `nostr+walletconnect://${validPubkey}?relay=${encodeURIComponent(validRelay)}&secret=${validSecret}`;

describe("NwcClient", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("creates a client from a valid NWC URI", () => {
    const client = new NwcClient(validUri);
    expect(client).toBeDefined();
  });

  it("throws on invalid URI", () => {
    expect(() => new NwcClient("https://bad")).toThrow();
  });

  it("connects to the relay WebSocket", async () => {
    const client = new NwcClient(validUri);
    await client.connect();
    // Should have sent a REQ subscription
    const ws = (client as any).ws as MockWebSocket;
    expect(ws.url).toBe(validRelay);
    expect(ws.sent.length).toBeGreaterThan(0);
    const firstMsg = JSON.parse(ws.sent[0]);
    expect(firstMsg[0]).toBe("REQ");
    client.disconnect();
  });

  it("disconnects cleanly", async () => {
    const client = new NwcClient(validUri);
    await client.connect();
    client.disconnect();
    expect((client as any).ws).toBeNull();
  });

  it("rejects makeInvoice on timeout", async () => {
    const client = new NwcClient(validUri);
    await client.connect();

    vi.useFakeTimers();

    // Capture the rejection immediately to avoid unhandled rejection
    let rejection: Error | undefined;
    const promise = client.makeInvoice(100, "test").catch((e: Error) => {
      rejection = e;
    });

    await vi.advanceTimersByTimeAsync(31_000);
    await promise;

    expect(rejection).toBeDefined();
    expect(rejection!.message).toContain("timeout");
    client.disconnect();
    vi.useRealTimers();
  });
});
