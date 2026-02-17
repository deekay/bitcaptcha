import {
  getConversationKey,
  nip44Encrypt,
  nip44Decrypt,
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
const NWC_INFO_KIND = 13194;
const DEFAULT_TIMEOUT = 30_000;

export class NwcClient {
  private params: NwcConnectionParams;
  private clientPubkey: string;
  private conversationKey: Uint8Array;
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (r: NwcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private subscriptionId: string | null = null;

  constructor(nwcUri: string) {
    this.params = parseNwcUri(nwcUri);
    this.clientPubkey = getPublicKey(this.params.secret);
    this.conversationKey = getConversationKey(
      this.params.secret,
      this.params.walletPubkey,
    );
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.params.relayUrl);
      this.ws = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket connection timeout"));
      }, DEFAULT_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.subscribe();
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket connection failed"));
      };

      ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      ws.onclose = () => {
        this.ws = null;
        // Reject all pending requests
        for (const [id, req] of this.pendingRequests) {
          clearTimeout(req.timer);
          req.reject(new Error("WebSocket closed"));
          this.pendingRequests.delete(id);
        }
      };
    });
  }

  private subscribe(): void {
    // Subscribe to NWC response events addressed to us
    this.subscriptionId = "bitcaptcha-" + Math.random().toString(36).slice(2, 8);
    const filter = {
      kinds: [NWC_RESPONSE_KIND],
      authors: [this.params.walletPubkey],
      "#p": [this.clientPubkey],
      since: Math.floor(Date.now() / 1000) - 10,
    };
    this.send(["REQ", this.subscriptionId, filter]);
  }

  private handleMessage(raw: string): void {
    let msg: unknown[];
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (!Array.isArray(msg)) return;

    if (msg[0] === "EVENT" && msg[2]) {
      this.handleEvent(msg[2] as NostrEvent);
    }
  }

  private handleEvent(event: NostrEvent): void {
    if (event.kind !== NWC_RESPONSE_KIND) return;
    if (event.pubkey !== this.params.walletPubkey) return;

    // Find the request event ID this is responding to (in "e" tag)
    const eTag = event.tags.find((t) => t[0] === "e");
    if (!eTag) return;
    const requestId = eTag[1];

    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    try {
      const decrypted = nip44Decrypt(event.content, this.conversationKey);
      const response = JSON.parse(decrypted) as NwcResponse;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
      pending.resolve(response);
    } catch (err) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
      pending.reject(
        err instanceof Error ? err : new Error("Failed to decrypt response"),
      );
    }
  }

  private async sendRequest(request: NwcRequest): Promise<NwcResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const encrypted = nip44Encrypt(
      JSON.stringify(request),
      this.conversationKey,
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

    return new Promise<NwcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(event.id);
        reject(new Error(`NWC request timeout: ${request.method}`));
      }, DEFAULT_TIMEOUT);

      this.pendingRequests.set(event.id, { resolve, reject, timer });
      this.send(["EVENT", event]);
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
    if (this.subscriptionId && this.ws?.readyState === WebSocket.OPEN) {
      this.send(["CLOSE", this.subscriptionId]);
    }
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error("Client disconnected"));
      this.pendingRequests.delete(id);
    }
    this.ws?.close();
    this.ws = null;
  }
}
