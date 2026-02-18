import { NwcClient } from "./nwc/client.js";
import { PaymentStateMachine } from "./payment/state-machine.js";
import { isWeblnAvailable, payWithWebln } from "./payment/webln.js";
import { verifyPreimage, createVerificationToken } from "./payment/verify.js";
import { Renderer } from "./ui/renderer.js";
import type { WidgetConfig, VerificationToken } from "./types.js";

const POLL_INTERVAL = 3000;
const MAX_POLLS = 100; // 5 minutes at 3s intervals
const LIST_TX_FALLBACK_AFTER = 3;

export class BitCaptchaWidget {
  private config: WidgetConfig;
  private nwc: NwcClient;
  private stateMachine: PaymentStateMachine;
  private renderer: Renderer;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
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
      onConfirmPaid: () => this.confirmPaid(),
    });

    this.stateMachine.onStateChange((state, data) => {
      this.renderer.render(state, data || {});
    });
  }

  private async startPayment(): Promise<void> {
    try {
      this.stateMachine.transition("invoicing");

      // Lazy connect to NWC relay
      await this.nwc.connect();

      // Create invoice
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

        // WebLN failed/rejected — fall back to QR display
        this.stateMachine.transition("awaiting_payment", {
          invoice: invoice.invoice,
          paymentHash: invoice.payment_hash,
        });
      }

      // Start polling for payment
      this.startPolling(invoice.payment_hash);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create invoice";
      this.stateMachine.transition("error", { error: message });
    }
  }

  /**
   * Check for payment settlement using all available NWC methods.
   * Returns true if payment was detected and handled.
   */
  private async checkPayment(paymentHash: string): Promise<boolean> {
    // 1. Try lookup_invoice — check preimage OR settled_at
    try {
      const result = await this.nwc.lookupInvoice(paymentHash);
      if (result.preimage) {
        this.handlePaymentReceived(result.preimage, paymentHash);
        return true;
      }
      if (result.settled_at) {
        this.handleSettledWithoutPreimage(paymentHash);
        return true;
      }
    } catch (err) {
      console.warn("[BitCaptcha] lookup_invoice failed:", err instanceof Error ? err.message : err);
    }

    // 2. Try list_transactions as fallback
    try {
      const txResult = await this.nwc.listTransactions(this.invoiceCreatedAt);
      const match = txResult.transactions?.find(
        (tx) => tx.payment_hash === paymentHash,
      );
      if (match) {
        if (match.preimage) {
          this.handlePaymentReceived(match.preimage, paymentHash);
          return true;
        }
        if (match.settled_at) {
          this.handleSettledWithoutPreimage(paymentHash);
          return true;
        }
      }
    } catch {
      // list_transactions not supported — that's OK
    }

    return false;
  }

  private startPolling(paymentHash: string): void {
    this.stopPolling();
    let pollCount = 0;

    this.pollTimer = setInterval(async () => {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        this.stopPolling();
        this.stateMachine.transition("error", {
          error: "Payment timeout — invoice expired",
        });
        return;
      }

      // After several failed polls, show "I've paid" button
      if (pollCount === LIST_TX_FALLBACK_AFTER + 2) {
        this.stateMachine.transition("awaiting_payment", {
          showConfirmPaid: true,
        });
      }

      const found = await this.checkPayment(paymentHash);
      if (found) {
        this.stopPolling();
      }
    }, POLL_INTERVAL);
  }

  /**
   * User clicked "I've paid" — do aggressive retry with short intervals.
   */
  private async confirmPaid(): Promise<void> {
    const paymentHash = this.stateMachine.data.paymentHash;
    if (!paymentHash) return;

    this.stateMachine.transition("awaiting_payment", {
      showConfirmPaid: false,
      confirmChecking: true,
    });

    // Try 5 rapid checks over ~15 seconds
    for (let i = 0; i < 5; i++) {
      const found = await this.checkPayment(paymentHash);
      if (found) {
        this.stopPolling();
        return;
      }
      if (i < 4) await new Promise((r) => setTimeout(r, 3000));
    }

    // Still not detected — show message and resume normal polling
    this.stateMachine.transition("awaiting_payment", {
      showConfirmPaid: true,
      confirmChecking: false,
      confirmFailed: true,
    });
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
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

    // Fire callback if configured
    if (this.config.callback && token) {
      this.fireCallback(token);
    }
  }

  /**
   * Wallet confirmed payment via settled_at but didn't return preimage.
   * Trust the wallet provider (same approach as Prophet).
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
