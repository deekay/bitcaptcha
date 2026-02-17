export interface WidgetConfig {
  wallet: string; // NWC URI
  amount: number; // sats
  description: string;
  callback?: string; // global function name
  theme: "light" | "dark" | "auto" | "neon-vice" | "laser-eyes" | "smooth-sailing" | "cyberdeck" | "vaporwave" | "terminal" | "bubblegum";
  buttonText: string;
  size: "normal" | "compact";
}

export interface VerificationToken {
  paymentHash: string;
  preimage: string;
  settledAt: number;
}

const DEFAULTS: Omit<WidgetConfig, "wallet"> = {
  amount: 100,
  description: "Verification payment",
  theme: "auto",
  buttonText: "Verify with Bitcoin",
  size: "normal",
};

export function parseConfig(element: HTMLElement): WidgetConfig {
  const wallet = element.dataset.wallet || element.dataset.nwc;
  if (!wallet) {
    throw new Error(
      "BitCaptcha: missing data-wallet attribute with NWC connection string",
    );
  }

  const amount = element.dataset.amount
    ? parseInt(element.dataset.amount, 10)
    : DEFAULTS.amount;

  if (isNaN(amount) || amount <= 0) {
    throw new Error("BitCaptcha: data-amount must be a positive number");
  }

  const theme = (element.dataset.theme || DEFAULTS.theme) as WidgetConfig["theme"];
  if (!["light", "dark", "auto", "neon-vice", "laser-eyes", "smooth-sailing", "cyberdeck", "vaporwave", "terminal", "bubblegum"].includes(theme)) {
    throw new Error('BitCaptcha: data-theme must be "light", "dark", "auto", "neon-vice", "laser-eyes", "smooth-sailing", "cyberdeck", "vaporwave", "terminal", or "bubblegum"');
  }

  const size = (element.dataset.size || DEFAULTS.size) as WidgetConfig["size"];
  if (!["normal", "compact"].includes(size)) {
    throw new Error('BitCaptcha: data-size must be "normal" or "compact"');
  }

  return {
    wallet,
    amount,
    description: element.dataset.description || DEFAULTS.description,
    callback: element.dataset.callback,
    theme,
    buttonText: element.dataset.buttonText || DEFAULTS.buttonText,
    size,
  };
}
