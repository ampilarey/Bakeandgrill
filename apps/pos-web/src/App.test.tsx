import { render, screen } from "@testing-library/react";
import App from "./App";

describe("POS App", () => {
  beforeEach(() => {
    // Ensure no leftover session from earlier tests — App renders LoginPage
    // when there is no `pos_token` in localStorage.
    localStorage.clear();
  });

  it("renders the login screen when not signed in", () => {
    render(<App />);
    // Copy that only appears on LoginPage, not the post-login header.
    expect(
      screen.getByText(/POS — Sign in with mobile or email \+ PIN/i),
    ).toBeInTheDocument();
  });
});
