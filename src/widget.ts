import { NwcClient } from "./nwc/client.js";
import { PaymentStateMachine } from "./payment/state-machine.js";
import { isWeblnAvailable, payWithWebln } from "./payment/webln.js";
import { verifyPreimage, createVerificationToken } from "./payment/verify.js";
import { Renderer } from "./ui/renderer.js";
import type { WidgetConfig, VerificationToken } from "./types.js";

const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 10_000;
const MAX_POLLS = 60; // 5 minutes at 5s intervals

export class BitCaptchaWidget {
  private config: WidgetConfig;
  private nwc: NwcClient;
  private stateMachine: PaymentStateMachine;
  private renderer: Renderer;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private invoiceCreatedAt = 0;

  constructor(container: HTMLElement, config: WidgetConfig) {
    this.config = config;
    this.nwc = new NwcClient(config.wallet);
    this.stateMachine = new PaymentStateMachine();

    this.renderer = new Renderer(container, {
      buttonText: config.buttonText,
      amount: config.amount,
      theme: config.theme,
      size: config.size,
      onVerifyClick: () => this.startPayment(),
      onRetryClick: () => this.retry(),
    });

    this.stateMachine.onStateChange((state, data) => {
      this.renderer.render(state, data || {});
    });
  }

  private async startPayment(): Promise<void> {
    try {
      this.stateMachine.transition("invoicing");

      await this.nwc.connect();

      const invoice = await this.nwc.makeInvoice(
        this.config.amount,
        this.config.description,
      );

      this.invoiceCreatedAt = Math.floor(Date.now() / 1000) - 10;

      this.stateMachine.transition("awaiting_payment", {
        invoice: invoice.invoice,
        paymentHash: invoice.payment_hash,
        amount: this.config.amount,
      });

      // Try WebLN first for one-click payment
      if (isWeblnAvailable()) {
        this.stateMachine.transition("webln_prompt");
        const preimage = await payWithWebln(invoice.invoice);

        if (preimage) {
          this.handlePaymentReceived(preimage, invoice.payment_hash);
          return;
        }

        this.stateMachine.transition("awaiting_payment", {
          invoice: invoice.invoice,
          paymentHash: invoice.payment_hash,
        });
      }

      this.startPolling(invoice.payment_hash, invoice.invoice);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create invoice";
      this.stateMachine.transition("error", { error: message });
    }
  }

  /**
   * Check if a lookup_invoice or transaction result indicates settlement.
   * Accepts preimage, settled_at, or state field as proof.
   */
  private checkResult(
    result: Record<string, unknown> | null | undefined,
    paymentHash: string,
  ): boolean {
    if (!result) return false;

    console.log("[BitCaptcha] checking result:", JSON.stringify(result));

    // 1. Preimage (cryptographic proof)
    const preimage = result.preimage as string | undefined;
    if (preimage && preimage.length > 0 && !/^0+$/.test(preimage)) {
      this.handlePaymentReceived(preimage, paymentHash);
      return true;
    }

    // 2. settled_at timestamp (trust provider)
    if (result.settled_at) {
      this.handleSettledWithoutPreimage(paymentHash);
      return true;
    }

    // 3. State field (some wallets use "settled" or "paid")
    const state = (result.state as string || "").toLowerCase();
    if (state === "settled" || state === "paid") {
      this.handleSettledWithoutPreimage(paymentHash);
      return true;
    }

    return false;
  }

  /**
   * Check for payment using all available NWC methods.
   * Tries lookup_invoice first, then list_transactions as fallback.
   */
  private async checkPayment(paymentHash: string, invoice: string): Promise<boolean> {
    // 1. lookup_invoice
    try {
      const result = await this.nwc.lookupInvoice(paymentHash, POLL_TIMEOUT);
      if (this.checkResult(result as Record<string, unknown>, paymentHash)) {
        return true;
      }
    } catch (err) {
      console.warn("[BitCaptcha] lookup_invoice failed:", err instanceof Error ? err.message : err);
    }

    // 2. list_transactions fallback
    // Match by payment_hash OR invoice (some wallets return null payment_hash)
    try {
      const txResult = await this.nwc.listTransactions(this.invoiceCreatedAt, POLL_TIMEOUT);
      const transactions = txResult.transactions || [];
      for (const tx of transactions) {
        if (tx.payment_hash === paymentHash || tx.invoice === invoice) {
          if (this.checkResult(tx as Record<string, unknown>, paymentHash)) {
            return true;
          }
        }
      }
    } catch {
      // list_transactions not supported
    }

    return false;
  }

  /**
   * Sequential polling — waits for each check to finish before scheduling the next.
   * Prevents overlapping subscriptions that can overwhelm the relay.
   */
  private startPolling(paymentHash: string, invoice: string): void {
    this.stopPolling();
    this.polling = true;
    let pollCount = 0;

    const poll = async () => {
      if (!this.polling) return;

      pollCount++;
      if (pollCount > MAX_POLLS) {
        this.stopPolling();
        this.stateMachine.transition("error", {
          error: "Payment timeout — invoice expired",
        });
        return;
      }

      console.log(`[BitCaptcha] poll #${pollCount}`);
      const found = await this.checkPayment(paymentHash, invoice);
      if (found) {
        this.stopPolling();
        return;
      }

      // Schedule next poll only after this one completes
      if (this.polling) {
        this.pollTimer = setTimeout(poll, POLL_INTERVAL);
      }
    };

    this.pollTimer = setTimeout(poll, POLL_INTERVAL);
  }

  private stopPolling(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private handlePaymentReceived(
    preimage: string,
    paymentHash: string,
  ): void {
    if (!verifyPreimage(preimage, paymentHash)) {
      this.stateMachine.transition("error", {
        error: "Payment verification failed — invalid preimage",
      });
      return;
    }

    const token = createVerificationToken(preimage, paymentHash);
    this.stateMachine.transition("verified", { preimage });

    if (this.config.callback && token) {
      this.fireCallback(token);
    }
  }

  /**
   * Wallet confirmed settlement via settled_at but no preimage returned.
   * Trust the wallet provider's confirmation (same approach as Prophet).
   */
  private handleSettledWithoutPreimage(paymentHash: string): void {
    const token: VerificationToken = {
      paymentHash,
      preimage: "",
      settledAt: Math.floor(Date.now() / 1000),
    };
    this.stateMachine.transition("verified", {});

    if (this.config.callback) {
      this.fireCallback(token);
    }
  }

  private fireCallback(token: VerificationToken): void {
    const callbackName = this.config.callback;
    if (!callbackName) return;

    const fn = (window as any)[callbackName];
    if (typeof fn === "function") {
      try {
        fn(token);
      } catch (err) {
        console.error("BitCaptcha: callback error:", err);
      }
    } else {
      console.warn(
        `BitCaptcha: callback "${callbackName}" is not a function on window`,
      );
    }
  }

  private retry(): void {
    this.stopPolling();
    this.stateMachine.reset();
  }

  destroy(): void {
    this.stopPolling();
    this.nwc.disconnect();
  }
}
