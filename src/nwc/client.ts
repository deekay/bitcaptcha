import {
  getNip04SharedSecret,
  nip04Encrypt,
  nip04Decrypt,
  computeEventId,
  signEvent,
  getPublicKey,
} from "./crypto.js";
import { parseNwcUri } from "./parse-uri.js";
import type {
  NwcConnectionParams,
  NostrEvent,
  NwcRequest,
  NwcResponse,
  MakeInvoiceResult,
  LookupInvoiceResult,
  ListTransactionsResult,
} from "./types.js";

const NWC_REQUEST_KIND = 23194;
const NWC_RESPONSE_KIND = 23195;
const DEFAULT_TIMEOUT = 30_000;

function debug(...args: unknown[]) {
  console.log("[BitCaptcha NWC]", ...args);
}

export class NwcClient {
  private params: NwcConnectionParams;
  private clientPubkey: string;
  private sharedSecret: Uint8Array;
  private ws: WebSocket | null = null;
  private wsConnecting: Promise<void> | null = null;

  constructor(nwcUri: string) {
    this.params = parseNwcUri(nwcUri);
    this.clientPubkey = getPublicKey(this.params.secret);
    this.sharedSecret = getNip04SharedSecret(
      this.params.secret,
      this.params.walletPubkey,
    );
    debug("Client pubkey:", this.clientPubkey);
    debug("Wallet pubkey:", this.params.walletPubkey);
    debug("Relay:", this.params.relayUrl);
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      debug("Already connected");
      return;
    }

    // If already connecting, wait for that to finish
    if (this.wsConnecting) return this.wsConnecting;

    debug("Connecting to relay:", this.params.relayUrl);
    this.wsConnecting = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.params.relayUrl);
      this.ws = ws;

      const timeout = setTimeout(() => {
        debug("Connection timeout after 30s");
        ws.close();
        reject(new Error("WebSocket connection timeout"));
      }, DEFAULT_TIMEOUT);

      ws.onopen = () => {
        debug("WebSocket connected");
        clearTimeout(timeout);
        resolve();
      };

      ws.onerror = (e) => {
        debug("WebSocket error:", e);
        clearTimeout(timeout);
        reject(new Error("WebSocket connection failed"));
      };

      ws.onclose = (e) => {
        debug("WebSocket closed, code:", e?.code, "reason:", e?.reason);
        this.ws = null;
        this.wsConnecting = null;
      };
    });

    return this.wsConnecting;
  }

  /**
   * Send an NWC request using the Prophet pattern:
   * 1. Subscribe for the response (filtering by request event ID)
   * 2. Wait for EOSE (subscription is active on relay)
   * 3. Only THEN publish the request event
   * This avoids the race condition where a response arrives before
   * the subscription is active.
   */
  private async sendRequest(request: NwcRequest, timeout: number = DEFAULT_TIMEOUT): Promise<NwcResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    debug("Encrypting request:", request.method);
    const encrypted = await nip04Encrypt(
      JSON.stringify(request),
      this.sharedSecret,
    );

    const event = await signEvent(
      {
        pubkey: this.clientPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: NWC_REQUEST_KIND,
        tags: [["p", this.params.walletPubkey]],
        content: encrypted,
      },
      this.params.secret,
    );

    debug("Request event ID:", event.id);

    const ws = this.ws!;
    const subId = "bitcaptcha-" + event.id.slice(0, 8);

    return new Promise<NwcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        debug(`REQUEST TIMEOUT after ${timeout}ms — no response received for`, request.method);
        this.send(["CLOSE", subId]);
        ws.removeEventListener("message", onMessage);
        reject(new Error(`NWC request timeout: ${request.method}`));
      }, timeout);

      let eoseReceived = false;

      const onMessage = (msg: MessageEvent) => {
        let parsed: unknown[];
        try {
          parsed = JSON.parse(msg.data);
        } catch {
          return;
        }
        if (!Array.isArray(parsed)) return;

        const msgType = parsed[0];

        // Log all relay messages for this subscription
        if (parsed[1] === subId) {
          debug("Relay message:", msgType, "subId:", subId);
        }

        // Log OK/NOTICE messages from relay (publish confirmations or errors)
        if (msgType === "OK") {
          debug("Relay OK:", parsed[1], "accepted:", parsed[2], "message:", parsed[3]);
        }
        if (msgType === "NOTICE") {
          debug("Relay NOTICE:", parsed[1]);
        }

        // Wait for EOSE before publishing the request
        if (msgType === "EOSE" && parsed[1] === subId) {
          if (!eoseReceived) {
            eoseReceived = true;
            debug("EOSE received — publishing request event");
            this.send(["EVENT", event]);
          }
          return;
        }

        // Handle response event
        if (msgType === "EVENT" && parsed[1] === subId && parsed[2]) {
          const responseEvent = parsed[2] as NostrEvent;
          debug("Got EVENT, kind:", responseEvent.kind, "from:", responseEvent.pubkey.slice(0, 12) + "...");

          if (responseEvent.kind !== NWC_RESPONSE_KIND) {
            debug("Ignoring: wrong kind (expected", NWC_RESPONSE_KIND, ")");
            return;
          }
          if (responseEvent.pubkey !== this.params.walletPubkey) {
            debug("Ignoring: wrong pubkey (expected", this.params.walletPubkey.slice(0, 12) + "...)");
            return;
          }

          // Verify this response is for our request (check "e" tag)
          const eTag = responseEvent.tags.find((t) => t[0] === "e");
          if (!eTag || eTag[1] !== event.id) {
            debug("Ignoring: e-tag mismatch, got:", eTag?.[1]?.slice(0, 12), "expected:", event.id.slice(0, 12));
            return;
          }

          debug("Decrypting response...");
          nip04Decrypt(responseEvent.content, this.sharedSecret)
            .then((decrypted) => {
              const response = JSON.parse(decrypted) as NwcResponse;
              debug("Response:", JSON.stringify(response));
              clearTimeout(timer);
              this.send(["CLOSE", subId]);
              ws.removeEventListener("message", onMessage);
              resolve(response);
            })
            .catch((err) => {
              debug("Decrypt FAILED:", err);
              clearTimeout(timer);
              this.send(["CLOSE", subId]);
              ws.removeEventListener("message", onMessage);
              reject(
                err instanceof Error
                  ? err
                  : new Error("Failed to decrypt response"),
              );
            });
        }
      };

      ws.addEventListener("message", onMessage);

      // Subscribe for the response FIRST, filtering by our request event ID
      const filter = {
        kinds: [NWC_RESPONSE_KIND],
        "#e": [event.id],
        "#p": [this.clientPubkey],
        since: Math.floor(Date.now() / 1000) - 10,
      };
      debug("Subscribing with filter:", JSON.stringify(filter));
      this.send(["REQ", subId, filter]);
    });
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async makeInvoice(
    amountSats: number,
    description: string,
  ): Promise<MakeInvoiceResult> {
    debug("makeInvoice:", amountSats, "sats,", `"${description}"`);
    const response = await this.sendRequest({
      method: "make_invoice",
      params: {
        amount: amountSats * 1000, // Convert sats to millisats
        description,
      },
    });

    if (response.error) {
      throw new Error(
        `make_invoice failed: ${response.error.message} (${response.error.code})`,
      );
    }

    return response.result as unknown as MakeInvoiceResult;
  }

  async lookupInvoice(paymentHash: string, timeout?: number): Promise<LookupInvoiceResult> {
    const response = await this.sendRequest({
      method: "lookup_invoice",
      params: { payment_hash: paymentHash },
    }, timeout);

    if (response.error) {
      throw new Error(
        `lookup_invoice failed: ${response.error.message} (${response.error.code})`,
      );
    }

    return response.result as unknown as LookupInvoiceResult;
  }

  async listTransactions(since: number, timeout?: number): Promise<ListTransactionsResult> {
    const response = await this.sendRequest({
      method: "list_transactions",
      params: { from: since, limit: 10, type: "incoming" },
    }, timeout);

    if (response.error) {
      throw new Error(
        `list_transactions failed: ${response.error.message} (${response.error.code})`,
      );
    }

    return response.result as unknown as ListTransactionsResult;
  }

  disconnect(): void {
    debug("Disconnecting");
    this.ws?.close();
    this.ws = null;
    this.wsConnecting = null;
  }
}
