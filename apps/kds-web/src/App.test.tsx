import { render, screen } from "@testing-library/react";
import App from "./App";

describe("KDS App", () => {
  it("renders the login header", () => {
    render(<App />);
    expect(screen.getByText("Bake & Grill KDS")).toBeInTheDocument();
  });
});
