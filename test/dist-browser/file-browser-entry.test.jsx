// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { FileBrowserEntry } from "../../dist-browser/src/components/FileBrowser/FileBrowserEntry.jsx";

// --- Fixtures ---

const parentEntry = { name: "..", type: "folder", ext: "" };
const folderEntry = { name: "subfolder", type: "folder", ext: "" };
const imageEntry = { name: "img1.png", type: "file", ext: "png" };
const textEntry = { name: "notes.txt", type: "file", ext: "txt" };

// --- Helpers ---

function renderEntry(props = {}) {
  const parentButtonRef = { current: null };
  const defaultProps = {
    entry: imageEntry,
    index: 1,
    isSelected: false,
    isHovered: false,
    currentPath: "subfolder",
    loading: false,
    parentButtonRef,
    setHoveredIndex: vi.fn(),
    onNavigate: vi.fn(),
    onSelect: vi.fn(),
    ...props,
  };

  const result = render(<FileBrowserEntry {...defaultProps} />);
  return { ...result, ...defaultProps };
}

// --- Lifecycle ---

afterEach(() => {
  cleanup();
});

// --- Tests ---

describe("FileBrowserEntry", () => {
  it("renders a treeitem labelled with the entry name", () => {
    const { getByRole } = renderEntry({ entry: imageEntry });
    const item = getByRole("treeitem");
    expect(item).toHaveClass("file-browser-item");
    expect(item).toHaveAttribute("aria-label", "img1.png");
    expect(item.getAttribute("tabIndex")).toBe("-1");
  });

  it("labels the parent row and renders its up button", () => {
    const { container } = renderEntry({ entry: parentEntry });
    const item = container.querySelector(".file-browser-item");
    expect(item).toHaveAttribute("aria-label", "Parent folder");
    expect(
      container.querySelector(".file-browser-name--parent"),
    ).toBeInTheDocument();

    // The type, tabIndex and aria-label of the up button are asserted through
    // the whole FileBrowser in file-browser.test.jsx, which owns the parent
    // button contract; here only its presence is checked.
    expect(
      container.querySelector(".file-browser-icon-parent"),
    ).toBeInTheDocument();
  });

  it("applies the selected and hovered classes", () => {
    const { container } = renderEntry({
      isSelected: true,
      isHovered: true,
    });
    const item = container.querySelector(".file-browser-item");
    expect(item).toHaveClass("file-browser-item--selected");
    expect(item).toHaveClass("file-browser-item--hovered");
    expect(item).toHaveAttribute("aria-selected", "true");
  });

  it("renders an icon for folders and images, and none for other files", () => {
    const { container: folder } = renderEntry({ entry: folderEntry });
    expect(folder.querySelector("svg")).toBeInTheDocument();

    const { container: image } = renderEntry({ entry: imageEntry });
    expect(image.querySelector("svg")).toBeInTheDocument();

    const { container: text } = renderEntry({ entry: textEntry });
    expect(text.querySelector(".file-browser-icon svg")).toBeNull();
  });

  it("selects an image on single click", () => {
    const { container, onSelect, entry } = renderEntry({ entry: imageEntry });
    fireEvent.click(container.querySelector(".file-browser-item"));
    expect(onSelect).toHaveBeenCalledWith(entry);
  });

  it("ignores a single click on the parent row", () => {
    const { container, onSelect, onNavigate } = renderEntry({
      entry: parentEntry,
    });
    fireEvent.click(container.querySelector(".file-browser-item"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("ignores clicks while the listing is loading", () => {
    const { container, onSelect, onNavigate } = renderEntry({
      entry: folderEntry,
      loading: true,
    });
    fireEvent.click(container.querySelector(".file-browser-item"));
    fireEvent.doubleClick(container.querySelector(".file-browser-item"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("navigates into a folder on double click", () => {
    const { container, onNavigate } = renderEntry({ entry: folderEntry });
    fireEvent.doubleClick(container.querySelector(".file-browser-item"));
    expect(onNavigate).toHaveBeenCalledWith("subfolder/subfolder");
  });

  it("navigates to the parent on a double click of the parent row", () => {
    const { container, onNavigate } = renderEntry({
      entry: parentEntry,
      currentPath: "archive/2024",
    });
    fireEvent.doubleClick(container.querySelector(".file-browser-item"));
    expect(onNavigate).toHaveBeenCalledWith("archive");
  });

  it("does nothing on a double click of an image", () => {
    const { container, onNavigate, onSelect } = renderEntry({
      entry: imageEntry,
    });
    fireEvent.doubleClick(container.querySelector(".file-browser-item"));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("records the hovered row index and clears it on leave", () => {
    const { container, setHoveredIndex } = renderEntry({
      entry: imageEntry,
      index: 2,
    });
    const item = container.querySelector(".file-browser-item");

    fireEvent.mouseEnter(item);
    expect(setHoveredIndex).toHaveBeenCalledWith(2);

    fireEvent.mouseLeave(item);
    expect(setHoveredIndex).toHaveBeenCalledWith(null);
  });
});
