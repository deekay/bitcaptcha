/** NWC connection parameters parsed from nostr+walletconnect:// URI */
export interface NwcConnectionParams {
  walletPubkey: string; // hex-encoded 32-byte pubkey of the wallet service
  relayUrl: string; // wss:// relay URL
  secret: string; // hex-encoded 32-byte client secret key
}

/** Nostr event (NIP-01) */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/** Unsigned event before signing */
export interface UnsignedEvent {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

/** NWC request methods we use */
export type NwcMethod = "make_invoice" | "lookup_invoice";

/** NWC request wrapper */
export interface NwcRequest {
  method: NwcMethod;
  params: Record<string, unknown>;
}

/** NWC response wrapper */
export interface NwcResponse {
  result_type: NwcMethod;
  error?: { code: string; message: string };
  result?: Record<string, unknown>;
}

/** make_invoice result */
export interface MakeInvoiceResult {
  type: "incoming";
  invoice: string; // BOLT-11 invoice
  description: string;
  description_hash: string;
  preimage: string;
  payment_hash: string;
  amount: number; // millisats
  fees_paid: number;
  created_at: number;
  expires_at: number;
}

/** lookup_invoice result */
export interface LookupInvoiceResult {
  type: "incoming";
  invoice: string;
  description: string;
  description_hash: string;
  preimage: string;
  payment_hash: string;
  amount: number;
  fees_paid: number;
  created_at: number;
  expires_at: number;
  settled_at?: number;
}
