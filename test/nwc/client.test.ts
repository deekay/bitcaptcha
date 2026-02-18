import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NwcClient } from "../../src/nwc/client.js";

// Mock WebSocket with addEventListener support
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  private listeners = new Map<string, Set<(event: any) => void>>();

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
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
    const event = { data };
    for (const listener of this.listeners.get("message") ?? []) {
      listener(event);
    }
  }
}

// Helper: flush microtasks (crypto.subtle resolves via microtasks, not timers)
function flush() {
  return new Promise<void>((r) => setTimeout(r, 0));
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
    const ws = (client as any).ws as MockWebSocket;
    expect(ws.url).toBe(validRelay);
    client.disconnect();
  });

  it("disconnects cleanly", async () => {
    const client = new NwcClient(validUri);
    await client.connect();
    client.disconnect();
    expect((client as any).ws).toBeNull();
  });

  it("sends REQ subscription before publishing EVENT on makeInvoice", async () => {
    const client = new NwcClient(validUri);
    await client.connect();
    const ws = (client as any).ws as MockWebSocket;

    // Start makeInvoice — don't use fake timers here because
    // crypto.subtle (nip04Encrypt) resolves via microtasks
    const promise = client.makeInvoice(100, "test").catch(() => {});

    // Let crypto.subtle and signEvent resolve
    await flush();
    await flush();
    await flush();

    // Should have sent a REQ subscription
    expect(ws.sent.length).toBeGreaterThan(0);
    const firstMsg = JSON.parse(ws.sent[0]);
    expect(firstMsg[0]).toBe("REQ");

    // No EVENT should have been sent yet (waiting for EOSE)
    const eventMsgs = ws.sent.filter(s => JSON.parse(s)[0] === "EVENT");
    expect(eventMsgs.length).toBe(0);

    client.disconnect();
  });

  it("publishes request only after EOSE", async () => {
    const client = new NwcClient(validUri);
    await client.connect();
    const ws = (client as any).ws as MockWebSocket;

    const promise = client.makeInvoice(100, "test").catch(() => {});

    // Let crypto resolve so REQ is sent
    await flush();
    await flush();
    await flush();

    // Get the subscription ID from the REQ message
    const reqMsg = JSON.parse(ws.sent[0]);
    expect(reqMsg[0]).toBe("REQ");
    const subId = reqMsg[1];

    // No EVENT sent yet
    expect(ws.sent.filter(s => JSON.parse(s)[0] === "EVENT").length).toBe(0);

    // Simulate EOSE from relay
    ws.receiveMessage(JSON.stringify(["EOSE", subId]));
    await flush();

    // Now an EVENT should have been published
    const eventMsgs = ws.sent.filter(s => JSON.parse(s)[0] === "EVENT");
    expect(eventMsgs.length).toBe(1);

    client.disconnect();
  });

  it("rejects makeInvoice on timeout", { timeout: 35_000 }, async () => {
    const client = new NwcClient(validUri);
    await client.connect();
    const ws = (client as any).ws as MockWebSocket;

    // Start makeInvoice — it will eventually timeout after 30s
    const promise = client.makeInvoice(100, "test");

    // Let crypto resolve and send EOSE so request is published
    await flush();
    await flush();
    await flush();
    const reqMsg = JSON.parse(ws.sent[0]);
    ws.receiveMessage(JSON.stringify(["EOSE", reqMsg[1]]));

    // Wait for real 30s timeout to fire
    await expect(promise).rejects.toThrow("timeout");
    client.disconnect();
  });
});
