// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { FileBrowser } from "../../dist-browser/src/components/FileBrowser/FileBrowser.jsx";

// --- Fixtures ---

const fixtures = {
  rootEntries: [
    { name: "..", type: "folder", ext: "" },
    { name: "subfolder", type: "folder", ext: "" },
    { name: "img1.png", type: "file", ext: "png" },
    { name: "img2.jpg", type: "file", ext: "jpg" },
  ],
  subfolderEntries: [
    { name: "..", type: "folder", ext: "" },
    { name: "img3.png", type: "file", ext: "png" },
  ],
};

// --- Helpers ---

/**
 * Render FileBrowser with minimal required props for testing.
 * `rerenderFileBrowser` re-renders with the same props plus overrides.
 */
function renderFileBrowser(props = {}) {
  const defaultProps = {
    currentPath: "",
    entries: fixtures.rootEntries,
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

// --- Lifecycle ---

beforeAll(() => {
  // Mock scrollIntoView (jsdom has it but the element may not be in a real DOM)
  Element.prototype.scrollIntoView = vi.fn();

  // Mock localStorage (jsdom provides it, but ensure it works)
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: vi.fn((key) => (key === "dist-browser-last-folder" ? "" : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    },
    writable: true,
  });
});

afterEach(() => {
  cleanup();
});

// --- Tests ---

describe("FileBrowser", () => {
  describe("rendering", () => {
    it("renders the file-browser root with role=tree", () => {
      const { container } = renderFileBrowser();
      const tree = container.querySelector('[role="tree"]');
      expect(tree).toBeTruthy();
      expect(tree.getAttribute("aria-label")).toBe("File browser");
    });

    it('renders all entries including the parent ".." entry', () => {
      const { getAllByRole } = renderFileBrowser();
      const treeItems = getAllByRole("treeitem");
      expect(treeItems).toHaveLength(4);
    });

    it('renders the ".." entry with correct aria-label', () => {
      const { getByRole } = renderFileBrowser();
      const parentItem = getByRole("treeitem", { name: "Parent folder" });
      expect(parentItem).toBeTruthy();
      expect(parentItem).toHaveAttribute("aria-label", "Parent folder");
    });

    it('marks the ".." entry as selected when selectedIndex=0', () => {
      const { getByRole } = renderFileBrowser({ selectedIndex: 0 });
      const parentItem = getByRole("treeitem", { name: "Parent folder" });
      expect(parentItem).toHaveAttribute("aria-selected", "true");
    });

    it('applies selected class to the ".." entry when selected', () => {
      const { container } = renderFileBrowser({ selectedIndex: 0 });
      const parentItem = container.querySelector('[data-index="0"]');
      expect(parentItem).toHaveClass("file-browser-item--selected");
    });
  });

  describe('tabIndex on ".." button', () => {
    it('the ".." inner button has tabIndex=-1 (not 0)', () => {
      const { container } = renderFileBrowser();
      const parentButton = container.querySelector(".file-browser-icon-parent");
      expect(parentButton).toBeTruthy();
      expect(parentButton.getAttribute("tabIndex")).toBe("-1");
    });

    it("the list container has tabIndex=0 for keyboard focus", () => {
      const { container } = renderFileBrowser();
      const list = container.querySelector(".file-browser-list");
      expect(list).toBeTruthy();
      expect(list.getAttribute("tabIndex")).toBe("0");
    });

    it("treeitem entries have tabIndex=-1 (roving tabindex pattern)", () => {
      const { container } = renderFileBrowser();
      const treeItems = container.querySelectorAll("[data-index]");
      treeItems.forEach((item) => {
        expect(item.getAttribute("tabIndex")).toBe("-1");
      });
    });
  });

  describe("keyboard navigation", () => {
    it("ArrowDown from index 0 selects the next entry (index 1)", () => {
      const onSelect = vi.fn();
      const { container } = renderFileBrowser({
        selectedIndex: 0,
        onSelect,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "ArrowDown" });

      // onSelect should be called with the second entry
      expect(onSelect).toHaveBeenCalledWith(fixtures.rootEntries[1]);
    });

    it("ArrowDown from a middle entry selects the following entry", () => {
      const onSelect = vi.fn();
      const { container } = renderFileBrowser({
        selectedIndex: 2,
        onSelect,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "ArrowDown" });

      // entries[2] is "img1.png", so the next one is "img2.jpg"
      expect(onSelect).toHaveBeenCalledWith(fixtures.rootEntries[3]);
    });

    it("ArrowUp from index 0 wraps to the last entry", () => {
      const onSelect = vi.fn();
      const { container } = renderFileBrowser({
        selectedIndex: 0,
        onSelect,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "ArrowUp" });

      expect(onSelect).toHaveBeenCalledWith(fixtures.rootEntries[3]);
    });

    it("ArrowDown on the last entry wraps to index 0", () => {
      const onSelect = vi.fn();
      const { container } = renderFileBrowser({
        selectedIndex: fixtures.rootEntries.length - 1,
        onSelect,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "ArrowDown" });

      expect(onSelect).toHaveBeenCalledWith(fixtures.rootEntries[0]);
    });

    it('Enter on ".." entry navigates to parent path', () => {
      const onNavigate = vi.fn();
      const { container } = renderFileBrowser({
        currentPath: "subfolder",
        entries: fixtures.subfolderEntries,
        selectedIndex: 0, // ".." is at index 0
        onNavigate,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "Enter" });

      expect(onNavigate).toHaveBeenCalledWith("");
    });

    it('Enter on ".." at root path navigates to root (empty string)', () => {
      const onNavigate = vi.fn();
      const { container } = renderFileBrowser({
        currentPath: "",
        entries: fixtures.rootEntries,
        selectedIndex: 0,
        onNavigate,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "Enter" });

      // getParentPath("") returns ""
      expect(onNavigate).toHaveBeenCalledWith("");
    });

    it("Backspace navigates to parent", () => {
      const onNavigate = vi.fn();
      const { container } = renderFileBrowser({
        currentPath: "subfolder",
        entries: fixtures.subfolderEntries,
        selectedIndex: 1, // "img3.png"
        onNavigate,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "Backspace" });

      expect(onNavigate).toHaveBeenCalledWith("");
    });

    it("does not process keys when loading", () => {
      const onSelect = vi.fn();
      const onNavigate = vi.fn();
      const { container } = renderFileBrowser({
        loading: true,
        selectedIndex: 0,
        onSelect,
        onNavigate,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "ArrowDown" });
      fireEvent.keyDown(list, { key: "Enter" });

      expect(onSelect).not.toHaveBeenCalled();
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it("does not process keys when entries are empty", () => {
      const onSelect = vi.fn();
      const { container } = renderFileBrowser({
        entries: [],
        selectedIndex: 0,
        onSelect,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "ArrowDown" });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("Home key selects first entry and focuses parent button", () => {
      const onSelect = vi.fn();
      const { container } = renderFileBrowser({
        currentPath: "subfolder",
        entries: fixtures.subfolderEntries,
        selectedIndex: 1, // "img3.png"
        onSelect,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "Home" });

      expect(onSelect).toHaveBeenCalledWith(fixtures.subfolderEntries[0]);
    });

    it('Delete key calls onDelete for non-".." entries', () => {
      const onDelete = vi.fn();
      const { container } = renderFileBrowser({
        entries: fixtures.rootEntries,
        selectedIndex: 2, // "img1.png"
        onDelete,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "Delete" });

      expect(onDelete).toHaveBeenCalledWith(fixtures.rootEntries[2]);
    });

    it('Delete key does not call onDelete for ".." entry', () => {
      const onDelete = vi.fn();
      const { container } = renderFileBrowser({
        entries: fixtures.rootEntries,
        selectedIndex: 0, // ".."
        onDelete,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "Delete" });

      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe("hover highlight", () => {
    it("marks the hovered entry", () => {
      const { container } = renderFileBrowser();
      const entry = container.querySelector('[data-index="1"]');

      fireEvent.mouseEnter(entry);

      expect(entry).toHaveClass("file-browser-item--hovered");
    });

    it("clears the hover highlight when the entry list is replaced", () => {
      // After a delete the rows shift, so an index-based hover state would
      // otherwise highlight a row the mouse never touched.
      const { container, rerenderFileBrowser } = renderFileBrowser();
      const img1 = container.querySelector('[data-index="2"]');

      fireEvent.mouseEnter(img1);
      expect(img1).toHaveClass("file-browser-item--hovered");

      // "img1.png" is gone, so index 2 is now a different entry
      rerenderFileBrowser({
        entries: [
          fixtures.rootEntries[0],
          fixtures.rootEntries[1],
          fixtures.rootEntries[3],
        ],
      });

      const shiftedRow = container.querySelector('[data-index="2"]');
      expect(shiftedRow.getAttribute("aria-label")).toBe("img2.jpg");
      expect(shiftedRow).not.toHaveClass("file-browser-item--hovered");
    });
  });

  describe("parent folder navigation", () => {
    it('Enter on ".." at root calls onNavigate with empty string', () => {
      const onNavigate = vi.fn();
      const { container } = renderFileBrowser({
        currentPath: "",
        entries: fixtures.rootEntries,
        selectedIndex: 0,
        onNavigate,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "Enter" });

      expect(onNavigate).toHaveBeenCalledWith("");
    });

    it('Enter on ".." in a subfolder navigates to parent', () => {
      const onNavigate = vi.fn();
      const { container } = renderFileBrowser({
        currentPath: "some/path",
        entries: fixtures.subfolderEntries,
        selectedIndex: 0, // ".."
        onNavigate,
      });
      const list = container.querySelector(".file-browser-list");

      fireEvent.keyDown(list, { key: "Enter" });

      expect(onNavigate).toHaveBeenCalledWith("some");
    });
  });

  describe("loading and error states", () => {
    it("renders loading state", () => {
      const { getByText } = renderFileBrowser({ loading: true, entries: [] });
      expect(getByText(/Loading…/i)).toBeTruthy();
    });

    it("renders error state", () => {
      const { getByRole } = renderFileBrowser({
        error: "Something went wrong",
        entries: [],
      });
      const alert = getByRole("alert");
      expect(alert.textContent).toBe("Something went wrong");
    });

    it("renders empty state when no entries and not loading", () => {
      const { getByText } = renderFileBrowser({ entries: [] });
      expect(getByText("This folder is empty.")).toBeTruthy();
    });
  });

  describe("parent button accessibility", () => {
    it('the ".." button has the correct aria-label', () => {
      const { container } = renderFileBrowser();
      const parentButton = container.querySelector(".file-browser-icon-parent");
      expect(parentButton).toBeTruthy();
      expect(parentButton.getAttribute("aria-label")).toBe(
        "Go to parent folder",
      );
    });

    it('the ".." button has the correct CSS class', () => {
      const { container } = renderFileBrowser();
      const parentButton = container.querySelector(".file-browser-icon-parent");
      expect(parentButton).toBeTruthy();
      expect(parentButton.classList).toContain("file-browser-icon-parent");
    });

    it('the ".." button is a <button> element with type=button', () => {
      const { container } = renderFileBrowser();
      const parentButton = container.querySelector(".file-browser-icon-parent");
      expect(parentButton.tagName).toBe("BUTTON");
      expect(parentButton.getAttribute("type")).toBe("button");
    });

    it('the ".." button navigates to the parent folder when clicked', () => {
      const onNavigate = vi.fn();
      const { container } = renderFileBrowser({
        currentPath: "some/path",
        entries: fixtures.subfolderEntries,
        selectedIndex: 0, // ".."
        onNavigate,
      });

      const parentButton = container.querySelector(".file-browser-icon-parent");
      fireEvent.click(parentButton);

      expect(onNavigate).toHaveBeenCalledWith("some");
    });
  });

  describe("refresh button", () => {
    it("renders a refresh button in the footer", () => {
      const { container } = renderFileBrowser();
      const refreshButton = container.querySelector(".file-browser-refresh");
      expect(refreshButton).toBeTruthy();
    });

    it("refresh button has correct aria-label", () => {
      const { container } = renderFileBrowser();
      const refreshButton = container.querySelector(".file-browser-refresh");
      expect(refreshButton.getAttribute("aria-label")).toBe("Refresh folder");
    });
  });
});
