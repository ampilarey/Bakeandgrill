import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ROLE_OPTIONS } from "../pages/SettingsPage/PermissionsSettingsSubPage";

describe("PermissionsSettingsSubPage roles", () => {
  it("includes kitchen_staff as fourth role option", () => {
    const slugs = ROLE_OPTIONS.map((r) => r.slug);
    expect(slugs).toContain("kitchen_staff");
    expect(slugs).toHaveLength(4);
  });
});

// Minimal render smoke — full page needs API mocks.
describe("PermissionsSettingsSubPage smoke", () => {
  it("kitchen staff label is human readable", () => {
    const kitchen = ROLE_OPTIONS.find((r) => r.slug === "kitchen_staff");
    expect(kitchen?.label).toMatch(/Kitchen Staff/i);
    render(<span>{kitchen?.label}</span>);
    expect(screen.getByText(/Kitchen Staff/i)).toBeInTheDocument();
  });
});
