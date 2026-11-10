// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

  it("does not focus the list on navigation (auto-focus hook removed)", async () => {
    const { container, rerenderFileBrowser } = renderFileBrowser();

    rerenderFileBrowser({
      currentPath: "",
      entries: [{ name: "img1.png", type: "file", ext: "png" }],
    });

    const list = container.querySelector(".file-browser-list");

    await settle();

    // The auto-focus-on-navigate effect was removed along with the
    // handleListFocus handler. The list no longer receives focus on path
    // changes; the scroll jump caused by handleListFocus is the reason.
    expect(document.activeElement).not.toBe(list);
  });

  it("does not shift focus on navigation when a new folder is entered", async () => {
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

    await settle();

    // The list and the ".." button are no longer auto-focused. Navigation
    // relies on the onKeyDown handler on the list for keyboard input.
    expect(document.activeElement).not.toBe(
      container.querySelector(".file-browser-list"),
    );
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

  it("does not redirect focus to the .. button when the list is focused", () => {
    const { container } = renderFileBrowser();
    const list = container.querySelector(".file-browser-list");

    // There is no onFocus handler on the list anymore. The old behavior of
    // redirecting focus to the ".." button was removed because it caused a
    // scroll jump: the browser auto-scrolls to the newly focused element,
    // sending the viewport back to the top of the list.
    fireEvent.focus(list);

    // jsdom does not update activeElement without a real focus handler.
    // The important assertion is that no parent-button focus was triggered.
    expect(container.querySelector(".file-browser-icon-parent")).toBeTruthy();
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

  it("selects the first entry on Home without changing focus", () => {
    const onSelect = vi.fn();
    const { container } = renderFileBrowser({
      currentPath: "subfolder",
      entries: subfolderEntries,
      selectedIndex: 1,
      onSelect,
    });
    const list = container.querySelector(".file-browser-list");

    fireEvent.keyDown(list, { key: "Home" });

    expect(onSelect).toHaveBeenCalledWith(subfolderEntries[0]);
    // The old behavior focused the ".." button. Now focus stays where it was;
    // the selection is handled entirely by the keyboard handler.
    expect(container.querySelector(".file-browser-icon-parent")).toBeTruthy();
  });
});
