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
} from "./types.js";

const NWC_REQUEST_KIND = 23194;
const NWC_RESPONSE_KIND = 23195;
const DEFAULT_TIMEOUT = 30_000;

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
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    // If already connecting, wait for that to finish
    if (this.wsConnecting) return this.wsConnecting;

    this.wsConnecting = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.params.relayUrl);
      this.ws = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket connection timeout"));
      }, DEFAULT_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket connection failed"));
      };

      ws.onclose = () => {
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
  private async sendRequest(request: NwcRequest): Promise<NwcResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

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

    const ws = this.ws!;
    const subId = "bitcaptcha-" + event.id.slice(0, 8);

    return new Promise<NwcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Unsubscribe and clean up
        this.send(["CLOSE", subId]);
        ws.removeEventListener("message", onMessage);
        reject(new Error(`NWC request timeout: ${request.method}`));
      }, DEFAULT_TIMEOUT);

      let eoseReceived = false;

      const onMessage = (msg: MessageEvent) => {
        let parsed: unknown[];
        try {
          parsed = JSON.parse(msg.data);
        } catch {
          return;
        }
        if (!Array.isArray(parsed)) return;

        // Wait for EOSE before publishing the request
        if (parsed[0] === "EOSE" && parsed[1] === subId) {
          if (!eoseReceived) {
            eoseReceived = true;
            // Now safe to publish — relay is listening
            this.send(["EVENT", event]);
          }
          return;
        }

        // Handle response event
        if (parsed[0] === "EVENT" && parsed[1] === subId && parsed[2]) {
          const responseEvent = parsed[2] as NostrEvent;
          if (responseEvent.kind !== NWC_RESPONSE_KIND) return;
          if (responseEvent.pubkey !== this.params.walletPubkey) return;

          // Verify this response is for our request (check "e" tag)
          const eTag = responseEvent.tags.find((t) => t[0] === "e");
          if (!eTag || eTag[1] !== event.id) return;

          nip04Decrypt(responseEvent.content, this.sharedSecret)
            .then((decrypted) => {
              const response = JSON.parse(decrypted) as NwcResponse;
              clearTimeout(timeout);
              this.send(["CLOSE", subId]);
              ws.removeEventListener("message", onMessage);
              resolve(response);
            })
            .catch((err) => {
              clearTimeout(timeout);
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

  async lookupInvoice(paymentHash: string): Promise<LookupInvoiceResult> {
    const response = await this.sendRequest({
      method: "lookup_invoice",
      params: { payment_hash: paymentHash },
    });

    if (response.error) {
      throw new Error(
        `lookup_invoice failed: ${response.error.message} (${response.error.code})`,
      );
    }

    return response.result as unknown as LookupInvoiceResult;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.wsConnecting = null;
  }
}
