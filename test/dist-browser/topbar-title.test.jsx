// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ThemeProvider } from "../../dist-browser/src/context/ThemeContext.jsx";
import { TopBar } from "../../dist-browser/src/components/TopBar/TopBar.jsx";

// --- Helpers ---

function renderTopBar(props = {}) {
  return render(
    <ThemeProvider>
      <TopBar onRefresh={() => {}} currentPath={props.currentPath} />
    </ThemeProvider>,
  );
}

// --- Tests ---

describe("TopBar title", () => {
  it('shows "Dist Browser" when at the dist root (empty path)', () => {
    const { container } = renderTopBar({ currentPath: "" });
    const title = container.querySelector(".topbar-title");
    expect(title.textContent).toBe("Dist Browser");
  });

  it('shows "Dist Browser" when currentPath is omitted', () => {
    const { container } = renderTopBar();
    const title = container.querySelector(".topbar-title");
    expect(title.textContent).toBe("Dist Browser");
  });

  it('shows "Dist Browser" when currentPath is explicitly null', () => {
    const { container } = renderTopBar({ currentPath: null });
    const title = container.querySelector(".topbar-title");
    expect(title.textContent).toBe("Dist Browser");
  });

  it('shows "Dist Browser" when currentPath is explicitly undefined', () => {
    const { container } = renderTopBar({ currentPath: undefined });
    const title = container.querySelector(".topbar-title");
    expect(title.textContent).toBe("Dist Browser");
  });

  it('shows "Dist Browser · folder/" for a single-level subfolder', () => {
    const { container } = renderTopBar({ currentPath: "archive" });
    const title = container.querySelector(".topbar-title");
    expect(title.textContent).toBe("Dist Browser · archive/");
  });

  it('shows "Dist Browser · path/nested/" for a nested subfolder', () => {
    const { container } = renderTopBar({ currentPath: "2025-11/some_folder" });
    const title = container.querySelector(".topbar-title");
    expect(title.textContent).toBe("Dist Browser · 2025-11/some_folder/");
  });

  it("appends a trailing slash to every subfolder path", () => {
    const { container } = renderTopBar({ currentPath: "a/b/c/d" });
    const title = container.querySelector(".topbar-title");
    expect(title.textContent).toBe("Dist Browser · a/b/c/d/");
  });

  it("shows an empty path title (with trailing slash) for a path named with spaces", () => {
    // The path is kept verbatim; only whitespace-only segments are dropped in
    // normalization. A folder literally named with spaces should still show.
    const { container } = renderTopBar({ currentPath: "my folder" });
    const title = container.querySelector(".topbar-title");
    expect(title.textContent).toBe("Dist Browser · my folder/");
  });

  it("renders the title inside the .topbar-title element", () => {
    const { container } = renderTopBar({ currentPath: "subfolder" });
    const titleElement = container.querySelector(".topbar-title");
    expect(titleElement).toBeTruthy();
    expect(titleElement.textContent).toBe("Dist Browser · subfolder/");
  });

  it("still renders theme and refresh buttons", () => {
    const { container } = renderTopBar({ currentPath: "archive" });
    const buttons = container.querySelectorAll(".topbar-button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute("aria-label")).toContain("Switch to");
    expect(buttons[1].getAttribute("aria-label")).toBe("Refresh");
  });
});
