// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { FileBrowser } from "../../dist-browser/src/components/FileBrowser/FileBrowser.jsx";
import { LAST_FOLDER_KEY } from "../../dist-browser/src/utils/last-folder.mjs";

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
      getItem: vi.fn((key) => (key === LAST_FOLDER_KEY ? "" : null)),
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

      // parentFolderPath("") returns ""
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

  describe("scroll selected entry into view", () => {
    function stubScrollIntoView() {
      const scrolled = [];
      Element.prototype.scrollIntoView = function () {
        scrolled.push(this.getAttribute("data-index"));
      };
      return scrolled;
    }

    it("scrolls the row highlighted by a selection change into view", async () => {
      const scrolled = stubScrollIntoView();
      const { rerenderFileBrowser } = renderFileBrowser({
        entries: fixtures.rootEntries,
        selectedIndex: 1,
      });

      rerenderFileBrowser({ selectedIndex: 3 });

      await waitFor(() => expect(scrolled).toEqual(["1", "3"]));
    });

    it("does not scroll when nothing is selected", () => {
      const scrolled = stubScrollIntoView();
      renderFileBrowser({ entries: fixtures.rootEntries, selectedIndex: -1 });

      expect(scrolled).toEqual([]);
    });

    it("does not scroll for an index the listing no longer has", () => {
      const scrolled = stubScrollIntoView();
      renderFileBrowser({ entries: [], selectedIndex: 2 });

      expect(scrolled).toEqual([]);
    });

    it("keeps the effect tied to the selection, not the listing", () => {
      const scrolled = stubScrollIntoView();
      const { rerenderFileBrowser } = renderFileBrowser({
        entries: fixtures.rootEntries,
        selectedIndex: 2,
      });

      scrolled.length = 0;
      rerenderFileBrowser({ entries: fixtures.subfolderEntries });

      expect(scrolled).toEqual([]);
    });
  });

  describe("keyboard navigation after a re-render", () => {
    // The handlers must always see the current entries, selection and loading
    // state: a stale closure would navigate against the previous listing.
    it("ArrowDown uses the selection from the latest render", () => {
      const onSelect = vi.fn();
      const { container, rerenderFileBrowser } = renderFileBrowser({
        entries: fixtures.rootEntries,
        selectedIndex: 0,
        onSelect,
      });
      const list = container.querySelector(".file-browser-list");

      rerenderFileBrowser({ selectedIndex: 2 });
      fireEvent.keyDown(list, { key: "ArrowDown" });

      // entries[2] is "img1.png", so the next row is "img2.jpg"
      expect(onSelect).toHaveBeenCalledWith(fixtures.rootEntries[3]);
    });

    it("ArrowDown uses the entries from the latest render", () => {
      const onSelect = vi.fn();
      const { container, rerenderFileBrowser } = renderFileBrowser({
        entries: fixtures.rootEntries,
        selectedIndex: 0,
        onSelect,
      });
      const list = container.querySelector(".file-browser-list");

      rerenderFileBrowser({ entries: fixtures.subfolderEntries });
      fireEvent.keyDown(list, { key: "ArrowDown" });

      expect(onSelect).toHaveBeenCalledWith(fixtures.subfolderEntries[1]);
    });

    it("keys are ignored once the listing starts loading again", () => {
      const onSelect = vi.fn();
      const { container, rerenderFileBrowser } = renderFileBrowser({
        entries: fixtures.rootEntries,
        selectedIndex: 0,
        onSelect,
      });
      const list = container.querySelector(".file-browser-list");

      rerenderFileBrowser({ loading: true });
      fireEvent.keyDown(list, { key: "ArrowDown" });
      expect(onSelect).not.toHaveBeenCalled();

      rerenderFileBrowser({ loading: false });
      fireEvent.keyDown(list, { key: "ArrowDown" });
      expect(onSelect).toHaveBeenCalledWith(fixtures.rootEntries[1]);
    });

    it("Delete uses the selection from the latest render", () => {
      const onDelete = vi.fn();
      const { container, rerenderFileBrowser } = renderFileBrowser({
        entries: fixtures.rootEntries,
        selectedIndex: 0,
        onDelete,
      });
      const list = container.querySelector(".file-browser-list");

      rerenderFileBrowser({ selectedIndex: 3 });
      fireEvent.keyDown(list, { key: "Delete" });

      expect(onDelete).toHaveBeenCalledWith(fixtures.rootEntries[3]);
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

  describe("last folder persistence", () => {
    it("does not touch storage itself: Layout is the only writer", () => {
      // Layout owns currentPath and persists it. If FileBrowser wrote too,
      // every navigation would be stored twice.
      renderFileBrowser({
        currentPath: "subfolder",
        entries: fixtures.subfolderEntries,
      });

      expect(localStorage.setItem).not.toHaveBeenCalled();
      expect(localStorage.removeItem).not.toHaveBeenCalled();
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

  describe("no refresh footer", () => {
    // Refreshing lives in the TopBar only; the file-browser footer was removed.
    it("renders no footer or refresh button", () => {
      const { container } = renderFileBrowser();
      expect(container.querySelector(".file-browser-footer")).toBeNull();
      expect(container.querySelector(".file-browser-refresh")).toBeNull();
    });
  });
});
