import type { PaymentState, StateData } from "../payment/state-machine.js";
import { styles } from "./styles.js";
import { lightningIcon, checkIcon, copyIcon, spinnerIcon } from "./icons.js";
import { renderQrCode } from "./qr.js";
import { copyToClipboard } from "../utils/clipboard.js";

export interface RendererOptions {
  buttonText: string;
  amount: number;
  theme: string;
  size: "normal" | "compact";
  onVerifyClick: () => void;
  onRetryClick: () => void;
  onConfirmPaid: () => void;
}

export class Renderer {
  private shadow: ShadowRoot;
  private container: HTMLElement;
  private options: RendererOptions;

  constructor(host: HTMLElement, options: RendererOptions) {
    this.options = options;
    this.shadow = host.attachShadow({ mode: "closed" });

    // Apply theme classes to the host (via the shadow root's host)
    const style = document.createElement("style");
    style.textContent = styles;
    this.shadow.appendChild(style);

    // Set theme class
    if (options.theme !== "light") {
      (this.shadow as any).host.classList.add(`bc-theme-${options.theme}`);
    }

    if (options.size === "compact") {
      (this.shadow as any).host.classList.add("bc-compact");
    }

    this.container = document.createElement("div");
    this.shadow.appendChild(this.container);

    this.render("idle", {});
  }

  render(state: PaymentState, data: StateData): void {
    switch (state) {
      case "idle":
        this.renderIdle();
        break;
      case "invoicing":
        this.renderInvoicing();
        break;
      case "awaiting_payment":
        this.renderAwaitingPayment(data);
        break;
      case "webln_prompt":
        this.renderWeblnPrompt();
        break;
      case "verified":
        this.renderVerified();
        break;
      case "error":
        this.renderError(data);
        break;
    }
  }

  private renderIdle(): void {
    this.container.innerHTML = `
      <div class="bc-container">
        <div class="bc-amount">\u20BF${this.options.amount}</div>
        <button class="bc-button" data-action="verify">
          ${lightningIcon}
          ${this.escapeHtml(this.options.buttonText)}
        </button>
      </div>
    `;
    this.bindAction("verify", this.options.onVerifyClick);
  }

  private renderInvoicing(): void {
    this.container.innerHTML = `
      <div class="bc-container">
        <div class="bc-amount">\u20BF${this.options.amount}</div>
        <button class="bc-button" disabled aria-busy="true">
          ${spinnerIcon}
          Creating invoice...
        </button>
      </div>
    `;
  }

  private renderAwaitingPayment(data: StateData): void {
    let bottomSection = `<div class="bc-status" role="status">${spinnerIcon} Waiting for payment...</div>`;

    if (data.confirmChecking) {
      bottomSection = `<div class="bc-status" role="status">${spinnerIcon} Checking payment...</div>`;
    } else if (data.showConfirmPaid) {
      const failMsg = data.confirmFailed
        ? `<div class="bc-confirm-hint">Your wallet may not support auto-verification. Payment is still processing — try again in a moment.</div>`
        : "";
      bottomSection = `
        <div class="bc-status" role="status">${spinnerIcon} Waiting for payment...</div>
        ${failMsg}
        <button class="bc-confirm-btn" data-action="confirm-paid">I've paid</button>
      `;
    }

    this.container.innerHTML = `
      <div class="bc-container">
        <div class="bc-amount">\u20BF${this.options.amount}</div>
        <div class="bc-qr-container" data-qr></div>
        <div class="bc-invoice-actions">
          <button class="bc-copy-btn" data-action="copy">
            ${copyIcon}
            Copy Invoice
          </button>
        </div>
        ${bottomSection}
      </div>
    `;

    if (data.invoice) {
      const qrContainer = this.shadow.querySelector("[data-qr]");
      if (qrContainer) {
        renderQrCode(qrContainer as HTMLElement, data.invoice);
      }

      this.bindAction("copy", async () => {
        const success = await copyToClipboard(data.invoice!);
        const btn = this.shadow.querySelector('[data-action="copy"]');
        if (btn && success) {
          btn.innerHTML = `${checkIcon} Copied!`;
          setTimeout(() => {
            btn.innerHTML = `${copyIcon} Copy Invoice`;
          }, 2000);
        }
      });
    }

    this.bindAction("confirm-paid", this.options.onConfirmPaid);
  }

  private renderWeblnPrompt(): void {
    this.container.innerHTML = `
      <div class="bc-container">
        <div class="bc-amount">\u20BF${this.options.amount}</div>
        <button class="bc-button" disabled aria-busy="true">
          ${spinnerIcon}
          Confirm in wallet...
        </button>
      </div>
    `;
  }

  private renderVerified(): void {
    this.container.innerHTML = `
      <div class="bc-container bc-verified">
        <div class="bc-verified-inner">
          ${checkIcon}
          Verified
        </div>
        <div class="bc-verified-sub">Payment confirmed</div>
      </div>
    `;
  }

  private renderError(data: StateData): void {
    this.container.innerHTML = `
      <div class="bc-container bc-error-state" role="alert">
        <div class="bc-error-msg">${this.escapeHtml(data.error || "Something went wrong")}</div>
        <button class="bc-retry-btn" data-action="retry">
          Try again
        </button>
      </div>
    `;
    this.bindAction("retry", this.options.onRetryClick);
  }

  private bindAction(action: string, handler: () => void): void {
    const el = this.shadow.querySelector(`[data-action="${action}"]`);
    if (el) {
      el.addEventListener("click", handler);
    }
  }

  private escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
