import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Nav } from "./nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/schedule",
}));

describe("Nav", () => {
  it("links to the help guide as a plain anchor", () => {
    render(<Nav />);

    const help = screen.getByRole("link", { name: "Help" });
    expect(help).toHaveAttribute("href", "/guide.html");
  });

  it("keeps the help link alongside the main sections", () => {
    render(<Nav />);

    for (const label of ["Schedule", "Clients", "Outreach", "Settings", "Help"]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
  });
});
