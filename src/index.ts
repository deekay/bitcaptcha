import { BitCaptchaWidget } from "./widget.js";
import { parseConfig } from "./types.js";
import type { WidgetConfig, VerificationToken } from "./types.js";

export { BitCaptchaWidget, parseConfig };
export type { WidgetConfig, VerificationToken };

function init(): void {
  const containers = document.querySelectorAll<HTMLElement>(
    "#bitcaptcha, [data-bitcaptcha]",
  );

  for (const container of containers) {
    try {
      const config = parseConfig(container);
      new BitCaptchaWidget(container, config);
    } catch (err) {
      console.error("BitCaptcha:", err instanceof Error ? err.message : err);
    }
  }
}

// Auto-init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
