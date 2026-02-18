export type PaymentState =
  | "idle"
  | "invoicing"
  | "awaiting_payment"
  | "webln_prompt"
  | "verified"
  | "error";

const VALID_TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  idle: ["invoicing"],
  invoicing: ["awaiting_payment", "error"],
  awaiting_payment: ["webln_prompt", "verified", "error"],
  webln_prompt: ["verified", "awaiting_payment", "error"],
  verified: [],
  error: ["idle"],
};

export type StateListener = (
  state: PaymentState,
  data?: StateData,
) => void;

export interface StateData {
  invoice?: string;
  paymentHash?: string;
  preimage?: string;
  error?: string;
  amount?: number;
}

export class PaymentStateMachine {
  private _state: PaymentState = "idle";
  private _data: StateData = {};
  private listeners: StateListener[] = [];

  get state(): PaymentState {
    return this._state;
  }

  get data(): Readonly<StateData> {
    return this._data;
  }

  transition(newState: PaymentState, data?: Partial<StateData>): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${this._state} → ${newState}`,
      );
    }
    this._state = newState;
    if (data) {
      this._data = { ...this._data, ...data };
    }
    for (const listener of this.listeners) {
      listener(this._state, this._data);
    }
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  reset(): void {
    this._state = "idle";
    this._data = {};
    for (const listener of this.listeners) {
      listener(this._state, this._data);
    }
  }
}
