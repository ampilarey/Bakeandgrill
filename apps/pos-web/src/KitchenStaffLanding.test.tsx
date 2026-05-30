import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KitchenStaffLanding } from "./components/KitchenStaffLanding";

describe("KitchenStaffLanding", () => {
  it("shows kitchen display link for kds-only staff", () => {
    render(
      <KitchenStaffLanding
        cashierName="Ali"
        onLogout={() => {}}
        kdsUrl="/kds"
      />,
    );
    expect(screen.getByText(/Signed in as/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Kitchen Display/i })).toHaveAttribute("href", "/kds");
  });
});
