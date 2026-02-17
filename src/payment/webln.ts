/**
 * WebLN interface (subset we need).
 * See: https://www.webln.dev/
 */
interface WebLNProvider {
  enable(): Promise<void>;
  sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
}

declare global {
  interface Window {
    webln?: WebLNProvider;
  }
}

export function isWeblnAvailable(): boolean {
  return typeof window !== "undefined" && !!window.webln;
}

export async function payWithWebln(
  invoice: string,
): Promise<string | null> {
  if (!isWeblnAvailable()) return null;

  try {
    await window.webln!.enable();
    const result = await window.webln!.sendPayment(invoice);
    return result.preimage;
  } catch {
    // User rejected or WebLN failed — fall back to QR/copy
    return null;
  }
}
