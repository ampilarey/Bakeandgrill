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
    // The page renders a brand title plus a "Sign in to start a shift"
    // subtitle inside its hero band.
    expect(
      screen.getByText(/Sign in to start a shift/i),
    ).toBeInTheDocument();
  });
});
