import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * FIX 9f — regression tests for credit-tender gating and split
 * behaviour in ChargeOverlay.
 *
 * These cover the three states the audit called out:
 *   1. eligible + fits → single house_account row on confirm.
 *   2. eligible + total exceeds available → split into
 *      [{house_account, available}, {cash, remainder}].
 *   3. permission granted but no attached customer → credit button
 *      disabled and says why, confirm blocked.
 *   4. attached customer but no credit account → credit button
 *      disabled and says why.
 *   5. total 0 < available fully utilised (over-limit) → banner
 *      reads "No credit available" and confirm stays disabled.
 *
 * Every test drives the overlay via user events — no shallow
 * rendering — because the split logic (integer laari math + row
 * construction) lives in the confirm handler and must be exercised
 * end-to-end.
 */
// Full-suite runs on CI hit occasional slowdowns when many jsdom
// environments spin up concurrently; user-event's click can sit
// behind the initial paint. Bumping the per-test timeout to 15s
// keeps these credit-tender tests green without masking real hangs.
describe("ChargeOverlay — credit tender (FIX 5 / FIX 9c)", { timeout: 15_000 }, () => {
  it("emits a single house_account row when the total fits", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => undefined);

    render(
      <ChargeOverlay
        total={80}
        creditEligible
        creditAvailableMvr={200}
        canPayCredit
        hasAttachedCustomer
        submitting={false}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Credit Account/i }));
    // Available banner should read the raw MVR figure.
    expect(screen.getByText(/Available credit: MVR 200\.00/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /CONFIRM PAYMENT/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([{ method: "house_account", amount: 80 }]);
  });

  it("splits into house_account + cash when total exceeds available", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => undefined);

    render(
      <ChargeOverlay
        total={100}
        creditEligible
        creditAvailableMvr={40}
        canPayCredit
        hasAttachedCustomer
        submitting={false}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Credit Account/i }));
    // Split-mode banner spells out the cash remainder.
    expect(
      screen.getByText(/Credit available MVR 40\.00 — remainder MVR 60\.00 will be collected in cash/i),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /CONFIRM PAYMENT/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([
      { method: "house_account", amount: 40 },
      { method: "cash", amount: 60 },
    ]);
  });

  it("disables Credit, and says why on the button, when no customer is attached", () => {
    render(
      <ChargeOverlay
        total={50}
        canPayCredit
        hasAttachedCustomer={false}
        creditEligible={false}
        creditAvailableMvr={0}
        submitting={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    // Owner, 2026-09-03: the standing hint under the chip cost 41px of the
    // tender column and pushed the note photos under the Confirm bar on an
    // iPad. The reason rides on the dimmed button instead.
    expect(screen.queryByText(/Attach a customer to charge a credit account/i)).toBeNull();
    const btn = screen.getByRole("button", { name: /Credit Account/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Attach a customer to charge a credit account.");
  });

  it("says on the button when an attached customer has no credit account", () => {
    render(
      <ChargeOverlay
        total={50}
        canPayCredit
        hasAttachedCustomer
        creditEligible={false}
        creditAvailableMvr={0}
        submitting={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    const btn = screen.getByRole("button", { name: /Credit Account/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Customer has no credit account.");
  });

  it("blocks confirm and shows 'No credit available' when limit is fully utilised", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => undefined);

    render(
      <ChargeOverlay
        total={50}
        creditEligible
        creditAvailableMvr={0}
        canPayCredit
        hasAttachedCustomer
        submitting={false}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Credit Account/i }));
    expect(screen.getByText(/No credit available/i)).toBeTruthy();

    const confirm = screen.getByRole("button", { name: /CONFIRM PAYMENT/i });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onSelectCredit when the cashier taps the Credit tender (FIX 8)", async () => {
    const user = userEvent.setup();
    const onSelectCredit = vi.fn();

    render(
      <ChargeOverlay
        total={80}
        creditEligible
        creditAvailableMvr={200}
        canPayCredit
        hasAttachedCustomer
        onSelectCredit={onSelectCredit}
        submitting={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Credit Account/i }));
    expect(onSelectCredit).toHaveBeenCalledTimes(1);
  });

  it("shows 'As of just now' pill when creditLastRefreshedAt is fresh", async () => {
    const user = userEvent.setup();

    render(
      <ChargeOverlay
        total={80}
        creditEligible
        creditAvailableMvr={200}
        canPayCredit
        hasAttachedCustomer
        creditLastRefreshedAt={Date.now()}
        submitting={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Credit Account/i }));
    expect(screen.getByText(/As of just now/i)).toBeTruthy();
  });
});
