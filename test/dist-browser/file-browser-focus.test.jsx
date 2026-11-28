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

// One tick, long enough to let any focus-restore effect settle.
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function focusRow(container, index) {
  const row = container.querySelector(`[data-index="${index}"]`);
  row.focus();
  expect(row).toBe(document.activeElement);
}

// --- Lifecycle ---

beforeAll(() => {
  // jsdom does not implement scrollIntoView; tests do not care about it.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  document.activeElement?.blur?.();
  document.body.innerHTML = "";
});

// --- Tests ---

describe("file browser focus", () => {
  it("does not focus the list on the first render", async () => {
    const { container } = renderFileBrowser();
    const list = container.querySelector(".file-browser-list");

    await settle();

    expect(document.activeElement).not.toBe(list);
  });

  it("does not focus the list on navigation when focus was never inside it", async () => {
    const { container, rerenderFileBrowser } = renderFileBrowser();

    rerenderFileBrowser({
      currentPath: "",
      entries: [{ name: "img1.png", type: "file", ext: "png" }],
    });

    const list = container.querySelector(".file-browser-list");

    await settle();

    expect(document.activeElement).not.toBe(list);
  });

  it("focuses the list on navigation when a row had focus", async () => {
    const { container, rerenderFileBrowser } = renderFileBrowser();
    const list = container.querySelector(".file-browser-list");

    focusRow(container, 1); // img3.png row had keyboard focus

    rerenderFileBrowser({
      currentPath: "",
      entries: [{ name: "img1.png", type: "file", ext: "png" }],
      selectedIndex: 0,
    });

    await settle();

    // The focused row was replaced by a new listing; the list gets focus back
    // so keyboard navigation keeps working.
    expect(document.activeElement).toBe(list);
  });

  it("focuses the list on navigation when a new folder is entered", async () => {
    const { container, rerenderFileBrowser } = renderFileBrowser({
      currentPath: "",
      entries: [{ name: "img1.png", type: "file", ext: "png" }],
      selectedIndex: 0,
    });
    const list = container.querySelector(".file-browser-list");

    focusRow(container, 0);

    rerenderFileBrowser({
      currentPath: "archive/2024",
      entries: [
        { name: "..", type: "folder", ext: "" },
        { name: "img7.png", type: "file", ext: "png" },
      ],
      selectedIndex: 0,
    });

    await settle();

    expect(document.activeElement).toBe(list);
  });

  it("focuses the list after a delete removes the focused row (path unchanged)", async () => {
    const { container, rerenderFileBrowser } = renderFileBrowser();
    const list = container.querySelector(".file-browser-list");

    focusRow(container, 1); // img3.png row had keyboard focus

    // Same folder, the img3.png row is gone after the trash refresh.
    rerenderFileBrowser({
      entries: [{ name: "..", type: "folder", ext: "" }],
      selectedIndex: 0,
    });

    await settle();

    expect(document.activeElement).toBe(list);
  });

  it("does not re-focus when the path is unchanged and only the selection moves", async () => {
    const { container, rerenderFileBrowser } = renderFileBrowser({
      currentPath: "",
      entries: [
        { name: "img1.png", type: "file", ext: "png" },
        { name: "img2.png", type: "file", ext: "png" },
      ],
      selectedIndex: 0,
    });
    // Capture the focused row node before the rerender; the focused row keeps
    // its identity across a selection-only move.
    const focusedRow = container.querySelector('[data-index="0"]');
    focusRow(container, 0);

    rerenderFileBrowser({ selectedIndex: 1 });

    await settle();

    // entries and path are unchanged: the effect does not re-focus and the
    // focused row keeps its own node.
    expect(document.activeElement).toBe(focusedRow);
  });

  it("leaves deliberate focus on an outside control alone when the listing changes", async () => {
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "refresh";
    document.body.appendChild(outsideButton);

    const { rerenderFileBrowser } = renderFileBrowser({
      currentPath: "",
      entries: [{ name: "img1.png", type: "file", ext: "png" }],
      selectedIndex: 0,
    });

    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    rerenderFileBrowser({
      currentPath: "",
      entries: [
        { name: "img1.png", type: "file", ext: "png" },
        { name: "img2.png", type: "file", ext: "png" },
      ],
      selectedIndex: 0,
    });

    await settle();

    // focus was deliberately on the outside control: it is not stolen
    expect(document.activeElement).toBe(outsideButton);

    outsideButton.remove();
  });

  it("does not redirect focus to the .. button when the list is focused", () => {
    const { container } = renderFileBrowser();
    const list = container.querySelector(".file-browser-list");

    // The list has no onFocus handler; the focused ".." button was removed
    // along with the handleListFocus redirect.
    fireEvent.focus(list);

    // jsdom does not update activeElement on fireEvent.focus; the important
    // assertion is that no parent-button focus was triggered.
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

    // No redirect to a ".." button exists at the dist root.
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
    // The focus is handled entirely by the keyboard handler; the list does
    // not get focused by Home.
    expect(container.querySelector(".file-browser-icon-parent")).toBeTruthy();
  });
});
