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
  onManualPreimage: (preimage: string) => boolean;
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
        <div class="bc-status" role="status">${spinnerIcon} Waiting for payment...</div>
        <details class="bc-manual"${data.showManualEntry ? " open" : ""}>
          <summary class="bc-manual-toggle">Already paid?</summary>
          <div class="bc-manual-body">
            <p class="bc-manual-hint">Paste the payment preimage from your wallet:</p>
            <div class="bc-manual-row">
              <input type="text" class="bc-manual-input" data-preimage placeholder="Preimage (hex)" spellcheck="false" autocomplete="off" />
              <button class="bc-manual-submit" data-action="manual-verify">Verify</button>
            </div>
            <div class="bc-manual-error" data-manual-error></div>
          </div>
        </details>
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

    this.bindAction("manual-verify", () => {
      const input = this.shadow.querySelector("[data-preimage]") as HTMLInputElement;
      const errorEl = this.shadow.querySelector("[data-manual-error]") as HTMLElement;
      if (!input || !errorEl) return;

      const preimage = input.value.trim();
      if (!preimage) {
        errorEl.textContent = "Please enter a preimage";
        return;
      }
      if (!/^[0-9a-fA-F]{64}$/.test(preimage)) {
        errorEl.textContent = "Invalid format — expected 64-character hex string";
        return;
      }
      errorEl.textContent = "";
      const valid = this.options.onManualPreimage(preimage);
      if (!valid) {
        errorEl.textContent = "Preimage does not match this invoice";
      }
    });
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
