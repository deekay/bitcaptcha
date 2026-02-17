import { describe, it, expect, vi } from "vitest";
import { PaymentStateMachine } from "../../src/payment/state-machine.js";

describe("PaymentStateMachine", () => {
  it("starts in idle state", () => {
    const sm = new PaymentStateMachine();
    expect(sm.state).toBe("idle");
  });

  it("transitions idle → invoicing", () => {
    const sm = new PaymentStateMachine();
    sm.transition("invoicing");
    expect(sm.state).toBe("invoicing");
  });

  it("transitions invoicing → awaiting_payment with data", () => {
    const sm = new PaymentStateMachine();
    sm.transition("invoicing");
    sm.transition("awaiting_payment", {
      invoice: "lnbc100n1...",
      paymentHash: "abc123",
    });
    expect(sm.state).toBe("awaiting_payment");
    expect(sm.data.invoice).toBe("lnbc100n1...");
    expect(sm.data.paymentHash).toBe("abc123");
  });

  it("transitions awaiting_payment → webln_prompt → verified", () => {
    const sm = new PaymentStateMachine();
    sm.transition("invoicing");
    sm.transition("awaiting_payment");
    sm.transition("webln_prompt");
    sm.transition("verified", { preimage: "deadbeef" });
    expect(sm.state).toBe("verified");
    expect(sm.data.preimage).toBe("deadbeef");
  });

  it("transitions awaiting_payment → verified directly", () => {
    const sm = new PaymentStateMachine();
    sm.transition("invoicing");
    sm.transition("awaiting_payment");
    sm.transition("verified", { preimage: "deadbeef" });
    expect(sm.state).toBe("verified");
  });

  it("transitions to error from invoicing", () => {
    const sm = new PaymentStateMachine();
    sm.transition("invoicing");
    sm.transition("error", { error: "Wallet offline" });
    expect(sm.state).toBe("error");
    expect(sm.data.error).toBe("Wallet offline");
  });

  it("transitions error → idle for retry", () => {
    const sm = new PaymentStateMachine();
    sm.transition("invoicing");
    sm.transition("error");
    sm.transition("idle");
    expect(sm.state).toBe("idle");
  });

  it("rejects invalid transition idle → verified", () => {
    const sm = new PaymentStateMachine();
    expect(() => sm.transition("verified")).toThrow("Invalid state transition");
  });

  it("rejects invalid transition idle → awaiting_payment", () => {
    const sm = new PaymentStateMachine();
    expect(() => sm.transition("awaiting_payment")).toThrow(
      "Invalid state transition",
    );
  });

  it("rejects transition from verified (terminal state)", () => {
    const sm = new PaymentStateMachine();
    sm.transition("invoicing");
    sm.transition("awaiting_payment");
    sm.transition("verified");
    expect(() => sm.transition("idle")).toThrow("Invalid state transition");
  });

  it("notifies listeners on state change", () => {
    const sm = new PaymentStateMachine();
    const listener = vi.fn();
    sm.onStateChange(listener);

    sm.transition("invoicing");
    expect(listener).toHaveBeenCalledWith("invoicing", expect.any(Object));

    sm.transition("awaiting_payment", { invoice: "lnbc..." });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(
      "awaiting_payment",
      expect.objectContaining({ invoice: "lnbc..." }),
    );
  });

  it("allows unsubscribing listeners", () => {
    const sm = new PaymentStateMachine();
    const listener = vi.fn();
    const unsub = sm.onStateChange(listener);

    sm.transition("invoicing");
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    sm.transition("awaiting_payment");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("resets to idle", () => {
    const sm = new PaymentStateMachine();
    sm.transition("invoicing");
    sm.transition("error", { error: "oops" });
    sm.reset();
    expect(sm.state).toBe("idle");
    expect(sm.data).toEqual({});
  });

  it("preserves accumulated data across transitions", () => {
    const sm = new PaymentStateMachine();
    sm.transition("invoicing");
    sm.transition("awaiting_payment", {
      invoice: "lnbc...",
      paymentHash: "hash123",
      amount: 100,
    });
    sm.transition("verified", { preimage: "preimage456" });
    expect(sm.data.invoice).toBe("lnbc...");
    expect(sm.data.paymentHash).toBe("hash123");
    expect(sm.data.preimage).toBe("preimage456");
    expect(sm.data.amount).toBe(100);
  });
});
