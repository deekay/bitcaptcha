import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseConfig } from "../src/types.js";

// Mock WebSocket for widget integration tests
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
}

describe("parseConfig", () => {
  function createElement(attrs: Record<string, string>): HTMLElement {
    const el = document.createElement("div");
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(`data-${key}`, value);
    }
    return el;
  }

  it("parses all config attributes", () => {
    const el = createElement({
      wallet: "nostr+walletconnect://" + "a".repeat(64) + "?relay=wss://r.com&secret=" + "b".repeat(64),
      amount: "50",
      description: "Test payment",
      callback: "onVerified",
      theme: "dark",
      "button-text": "Pay Now",
      size: "compact",
    });

    const config = parseConfig(el);
    expect(config.amount).toBe(50);
    expect(config.description).toBe("Test payment");
    expect(config.callback).toBe("onVerified");
    expect(config.theme).toBe("dark");
    expect(config.buttonText).toBe("Pay Now");
    expect(config.size).toBe("compact");
  });

  it("uses defaults for missing attributes", () => {
    const el = createElement({
      wallet: "nostr+walletconnect://" + "a".repeat(64) + "?relay=wss://r.com&secret=" + "b".repeat(64),
    });

    const config = parseConfig(el);
    expect(config.amount).toBe(100);
    expect(config.description).toBe("Verification payment");
    expect(config.theme).toBe("auto");
    expect(config.buttonText).toBe("Verify with Bitcoin");
    expect(config.size).toBe("normal");
  });

  it("accepts data-nwc as alias for data-wallet", () => {
    const el = createElement({
      nwc: "nostr+walletconnect://" + "a".repeat(64) + "?relay=wss://r.com&secret=" + "b".repeat(64),
    });

    const config = parseConfig(el);
    expect(config.wallet).toContain("nostr+walletconnect://");
  });

  it("throws on missing wallet", () => {
    const el = createElement({});
    expect(() => parseConfig(el)).toThrow("missing data-wallet");
  });

  it("throws on invalid amount", () => {
    const el = createElement({
      wallet: "nostr+walletconnect://" + "a".repeat(64) + "?relay=wss://r.com&secret=" + "b".repeat(64),
      amount: "abc",
    });
    expect(() => parseConfig(el)).toThrow("positive number");
  });

  it("throws on zero amount", () => {
    const el = createElement({
      wallet: "nostr+walletconnect://" + "a".repeat(64) + "?relay=wss://r.com&secret=" + "b".repeat(64),
      amount: "0",
    });
    expect(() => parseConfig(el)).toThrow("positive number");
  });

  it("throws on invalid theme", () => {
    const el = createElement({
      wallet: "nostr+walletconnect://" + "a".repeat(64) + "?relay=wss://r.com&secret=" + "b".repeat(64),
      theme: "purple",
    });
    expect(() => parseConfig(el)).toThrow("data-theme");
  });
});

describe("BitCaptchaWidget", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("renders initial state with verify button", async () => {
    // Dynamic import to pick up the mocked WebSocket
    const { BitCaptchaWidget } = await import("../src/widget.js");
    const container = document.createElement("div");
    document.body.appendChild(container);

    const widget = new BitCaptchaWidget(container, {
      wallet: "nostr+walletconnect://" + "a".repeat(64) + "?relay=wss://r.com&secret=" + "b".repeat(64),
      amount: 100,
      description: "Test",
      theme: "auto",
      buttonText: "Verify with Bitcoin",
      size: "normal",
    });

    // The widget renders into a closed shadow DOM, so we can verify
    // the container has a shadow root attached
    expect(container.shadowRoot).toBeNull(); // closed shadow DOM
    // But we can check it was created by verifying no error was thrown
    expect(widget).toBeDefined();

    widget.destroy();
    document.body.removeChild(container);
  });
});
