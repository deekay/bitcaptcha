import { NwcClient } from "./nwc/client.js";
import { PaymentStateMachine } from "./payment/state-machine.js";
import { isWeblnAvailable, payWithWebln } from "./payment/webln.js";
import { verifyPreimage, createVerificationToken } from "./payment/verify.js";
import { Renderer } from "./ui/renderer.js";
import type { WidgetConfig, VerificationToken } from "./types.js";

const POLL_INTERVAL = 3000;
const MAX_POLLS = 100; // 5 minutes at 3s intervals

export class BitCaptchaWidget {
  private config: WidgetConfig;
  private nwc: NwcClient;
  private stateMachine: PaymentStateMachine;
  private renderer: Renderer;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

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

      // Lazy connect to NWC relay
      await this.nwc.connect();

      // Create invoice
      const invoice = await this.nwc.makeInvoice(
        this.config.amount,
        this.config.description,
      );

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

      try {
        const result = await this.nwc.lookupInvoice(paymentHash);
        if (result.settled_at && result.preimage) {
          this.stopPolling();
          this.handlePaymentReceived(result.preimage, paymentHash);
        }
      } catch {
        // Ignore individual poll failures — will retry on next interval
      }
    }, POLL_INTERVAL);
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
