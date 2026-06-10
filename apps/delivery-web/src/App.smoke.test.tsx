import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "./pages/LoginPage";

describe("delivery-web", () => {
  it("login page smoke test", () => {
    render(<LoginPage onLogin={() => {}} />);
    expect(screen.getByText(/driver portal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
