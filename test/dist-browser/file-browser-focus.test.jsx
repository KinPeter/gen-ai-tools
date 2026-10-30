// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { FileBrowser } from "../../dist-browser/src/components/FileBrowser/FileBrowser.jsx";

// --- Fixtures ---

const subfolderEntries = [
  { name: "..", type: "folder", ext: "" },
  { name: "img3.png", type: "file", ext: "png" },
];

// --- Helpers ---

function renderFileBrowser(props = {}) {
  const defaultProps = {
    currentPath: "subfolder",
    entries: subfolderEntries,
    selectedIndex: 0,
    loading: false,
    error: null,
    onNavigate: vi.fn(),
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onRefresh: vi.fn(),
    ...props,
  };

  const result = render(<FileBrowser {...defaultProps} />);
  return {
    ...result,
    rerenderFileBrowser: (nextProps) =>
      result.rerender(<FileBrowser {...defaultProps} {...nextProps} />),
  };
}

// One tick, long enough for the `setTimeout(..., 0)` in the focus hook to run.
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

// --- Lifecycle ---

beforeAll(() => {
  // jsdom does not implement scrollIntoView; the focus tests do not care about
  // it but the scroll hook runs on every render.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

// --- Tests ---

describe("file browser focus", () => {
  it("does not focus the list on the first render", async () => {
    const { container } = renderFileBrowser();
    const list = container.querySelector(".file-browser-list");

    await settle();

    expect(document.activeElement).not.toBe(list);
  });

  it("focuses the list after navigating to the dist root, which has no .. row", async () => {
    const { container, rerenderFileBrowser } = renderFileBrowser();

    rerenderFileBrowser({
      currentPath: "",
      entries: [{ name: "img1.png", type: "file", ext: "png" }],
    });

    const list = container.querySelector(".file-browser-list");

    await waitFor(() => expect(document.activeElement).toBe(list));
  });

  it("redirects the auto-focus to the .. button when the new folder has one", async () => {
    const { container, rerenderFileBrowser } = renderFileBrowser({
      currentPath: "",
      entries: [{ name: "img1.png", type: "file", ext: "png" }],
    });

    rerenderFileBrowser({
      currentPath: "archive/2024",
      entries: [
        { name: "..", type: "folder", ext: "" },
        { name: "img7.png", type: "file", ext: "png" },
      ],
    });

    // Focusing the list is immediately handed to the ".." button so Enter and
    // Backspace can walk up a level.
    const parentButton = container.querySelector(".file-browser-icon-parent");

    await waitFor(() => expect(document.activeElement).toBe(parentButton));
  });

  it("does not re-focus when the path is unchanged", async () => {
    const { container, rerenderFileBrowser } = renderFileBrowser({
      currentPath: "",
      entries: [{ name: "img1.png", type: "file", ext: "png" }],
    });
    const list = container.querySelector(".file-browser-list");

    rerenderFileBrowser({ selectedIndex: 1 });

    await settle();

    expect(document.activeElement).not.toBe(list);
  });

  it("hands keyboard focus from the list to the .. button", () => {
    const { container } = renderFileBrowser();
    const list = container.querySelector(".file-browser-list");
    const parentButton = container.querySelector(".file-browser-icon-parent");

    fireEvent.focus(list);

    expect(document.activeElement).toBe(parentButton);
  });

  it("does nothing when the list is focused at the dist root, where there is no .. row", () => {
    const { container } = renderFileBrowser({
      currentPath: "",
      entries: [{ name: "img1.png", type: "file", ext: "png" }],
    });
    const list = container.querySelector(".file-browser-list");

    expect(container.querySelector(".file-browser-icon-parent")).toBeNull();

    fireEvent.focus(list);

    // Nothing to redirect to: the focus handler is a no-op at the root.
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses the .. button when Home selects the first entry", () => {
    const onSelect = vi.fn();
    const { container } = renderFileBrowser({
      currentPath: "subfolder",
      entries: subfolderEntries,
      selectedIndex: 1,
      onSelect,
    });
    const list = container.querySelector(".file-browser-list");
    const parentButton = container.querySelector(".file-browser-icon-parent");

    fireEvent.keyDown(list, { key: "Home" });

    expect(onSelect).toHaveBeenCalledWith(subfolderEntries[0]);
    expect(document.activeElement).toBe(parentButton);
  });
});
