import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import App from "./App";

describe("Online Order App", () => {
  it("redirects the legacy App entry point to /", () => {
    // App.tsx is now just <Navigate to="/" replace />. Verify that
    // rendering it inside a router does NOT throw (the previous test
    // crashed with "Navigate may be used only in the context of a
    // Router") and that the redirect target is reachable.
    const { container } = render(
      <MemoryRouter initialEntries={["/legacy"]}>
        <Routes>
          <Route path="/" element={<div data-testid="home">home</div>} />
          <Route path="/legacy" element={<App />} />
        </Routes>
      </MemoryRouter>
    );
    expect(container.querySelector('[data-testid="home"]')).toBeTruthy();
  });
});
