// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Layout } from "../../dist-browser/src/components/Layout/Layout.jsx";
import { ThemeProvider } from "../../dist-browser/src/context/ThemeContext.jsx";

// --- Fixtures ---

const folder = (name) => ({ name, type: "folder", ext: "" });
const image = (name) => ({ name, type: "file", ext: name.split(".").pop() });

// --- API mock (mirrors dist-browser/server.mjs responses) ---

function apiResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/**
 * Mock `/api/fs/<path>` and `/api/trash` against an in-memory listing so a
 * delete really removes the entry from the listing the app re-fetches.
 *
 * `/api/trash` answers exactly like dist-browser/server.mjs: HTTP 200 with
 * `{ ok, errors }`, per-path failures reported inside the body.
 *
 * `trashResponse` overrides the trash reply (for HTTP failures),
 * `trashError` makes the trash request throw (for network failures),
 * `fsFailOnCall` fails the Nth (1-based) directory listing request, and
 * `serverCreatesTrash` makes the root listing contain the `.trash` folder the
 * real server creates on the first trash call.
 */
function mockApi({
  listings,
  trashResponse = null,
  trashError = null,
  fsFailOnCall = null,
  serverCreatesTrash = false,
}) {
  const state = { listings: { ...listings }, trashed: [], fsCalls: 0 };

  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options = {}) => {
      const requestUrl = String(url);

      if (requestUrl.startsWith("/api/fs/")) {
        state.fsCalls += 1;
        if (fsFailOnCall === state.fsCalls) {
          return apiResponse({ error: "Directory not found" }, 500);
        }
        const path = decodeURIComponent(requestUrl.slice("/api/fs/".length));
        return apiResponse({ path, entries: state.listings[path] ?? [] });
      }

      if (requestUrl === "/api/trash") {
        if (trashError) throw trashError;
        if (trashResponse) return trashResponse;

        const body = JSON.parse(options.body);
        state.trashed.push(...body.paths);

        for (const itemPath of body.paths) {
          const parentPath = itemPath.includes("/")
            ? itemPath.slice(0, itemPath.lastIndexOf("/"))
            : "";
          const name = itemPath.split("/").pop();
          state.listings[parentPath] = (
            state.listings[parentPath] ?? []
          ).filter((entry) => entry.name !== name);
        }

        // handleTrash mkdirs .trash in the served dist root and handleFS does
        // not hide it, so it shows up in the root listing after a delete.
        if (serverCreatesTrash) {
          const root = state.listings[""] ?? [];
          if (!root.some((entry) => entry.name === ".trash")) {
            state.listings[""] = [...root, folder(".trash")];
          }
        }

        return apiResponse({ ok: true, errors: [] });
      }

      throw new Error(`Unexpected request: ${requestUrl}`);
    });

  return { state, fetchMock };
}

// --- Helpers ---

function renderLayout(listings, options = {}) {
  const mocked = mockApi({ listings, ...options });
  const result = render(
    <ThemeProvider>
      <Layout />
    </ThemeProvider>,
  );
  return { ...result, ...mocked };
}

function itemByName(container, name) {
  return container.querySelector(`.file-browser-item[aria-label="${name}"]`);
}

function selectedItemNames(container) {
  return [...container.querySelectorAll(".file-browser-item--selected")].map(
    (item) => item.getAttribute("aria-label"),
  );
}

function viewerSrc(container) {
  const img = container.querySelector(".image-viewer-image");
  return img ? img.getAttribute("src") : null;
}

function emptyViewer(container) {
  return container.querySelector(".image-viewer-empty");
}

async function selectImage(container, name) {
  await waitFor(() => expect(itemByName(container, name)).toBeTruthy());
  fireEvent.click(itemByName(container, name));
}

function deleteSelected(container) {
  fireEvent.keyDown(container.querySelector(".file-browser-list"), {
    key: "Delete",
  });
}

// --- Lifecycle ---

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

// --- Tests ---

describe("Layout delete flow", () => {
  it("shows the empty viewer state before any image is selected", async () => {
    const { container } = renderLayout({
      "": [folder("archive"), image("img1.png")],
    });

    await waitFor(() => expect(viewerSrc(container)).toBeNull());
    expect(emptyViewer(container)).toBeInTheDocument();
    expect(emptyViewer(container).textContent).toMatch(/No image selected/i);
    expect(emptyViewer(container).getAttribute("role")).toBe("status");
  });

  it("displays an image when it is clicked in the file list", async () => {
    const { container } = renderLayout({
      "": [folder("archive"), image("img1.png"), image("img2.jpg")],
    });

    await selectImage(container, "img2.jpg");

    expect(viewerSrc(container)).toBe("/api/images/img2.jpg");
    expect(container.querySelector(".image-viewer-empty")).toBeNull();
  });

  it("clears the viewer when a folder is clicked while an image is displayed", async () => {
    const { container } = renderLayout({
      "": [folder("archive"), image("img1.png")],
    });

    await selectImage(container, "img1.png");
    expect(viewerSrc(container)).toBe("/api/images/img1.png");

    fireEvent.click(itemByName(container, "archive"));

    await waitFor(() => expect(viewerSrc(container)).toBeNull());
    expect(emptyViewer(container)).toBeInTheDocument();
    // The folder is the highlighted row, but no image or log is shown
    expect(selectedItemNames(container)).toEqual(["archive"]);
    expect(container.querySelector(".log-viewer-placeholder")).toBeNull();
  });

  it("selects and displays the next image after deleting one in the middle", async () => {
    const { container, state, fetchMock } = renderLayout({
      "": [
        folder("archive"),
        image("img1.png"),
        image("img2.jpg"),
        image("img3.png"),
      ],
    });

    await selectImage(container, "img2.jpg");
    expect(viewerSrc(container)).toBe("/api/images/img2.jpg");

    deleteSelected(container);

    await waitFor(() =>
      expect(viewerSrc(container)).toBe("/api/images/img3.png"),
    );

    // The trashed image is gone from the list and no longer displayed
    expect(itemByName(container, "img2.jpg")).toBeNull();
    expect(state.trashed).toEqual(["img2.jpg"]);
    expect(selectedItemNames(container)).toEqual(["img3.png"]);
    // The viewer and the log column both follow the new selection
    expect(
      container.querySelector(".image-viewer-image").getAttribute("alt"),
    ).toBe("img3.png");
    expect(container.querySelector(".log-viewer-placeholder")).toBeTruthy();
    expect(
      container.querySelector(".log-viewer-placeholder p").textContent,
    ).toBe("Log for: img3.png");

    // Refreshed listing after the trash call
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url === "/api/trash")).toHaveLength(1);
    expect(urls.filter((url) => url.startsWith("/api/fs/"))).toHaveLength(2);
  });

  it("scrolls the row that takes over the selection into view", async () => {
    // jsdom has no working scrollIntoView: record every row the scroll effect
    // asks to bring into view.
    const scrolled = [];
    Element.prototype.scrollIntoView = function () {
      scrolled.push(this.getAttribute("data-index"));
    };

    const { container } = renderLayout({
      "": [image("img1.png"), image("img2.jpg"), image("img3.png")],
    });

    await waitFor(() => expect(itemByName(container, "img1.png")).toBeTruthy());
    scrolled.length = 0;

    fireEvent.click(itemByName(container, "img3.png"));
    await waitFor(() =>
      expect(selectedItemNames(container)).toEqual(["img3.png"]),
    );
    scrolled.length = 0;

    deleteSelected(container);

    await waitFor(() =>
      expect(selectedItemNames(container)).toEqual(["img2.jpg"]),
    );

    // img2.jpg now sits at index 1 and is the highlighted row, so the effect
    // scrolls that exact row. React flushes the scroll effect just after the
    // commit, so wait for it instead of asserting synchronously.
    const selectedRow = itemByName(container, "img2.jpg");
    await waitFor(() =>
      expect(scrolled.at(-1)).toBe(selectedRow.getAttribute("data-index")),
    );
    expect(selectedRow).toHaveClass("file-browser-item--selected");
  });

  it("shows the previous image when the last image is deleted", async () => {
    const { container } = renderLayout({
      "": [
        folder("archive"),
        image("img1.png"),
        image("img2.jpg"),
        image("img3.png"),
      ],
    });

    await selectImage(container, "img3.png");

    deleteSelected(container);

    await waitFor(() =>
      expect(viewerSrc(container)).toBe("/api/images/img2.jpg"),
    );
    expect(selectedItemNames(container)).toEqual(["img2.jpg"]);
    expect(itemByName(container, "img3.png")).toBeNull();
  });

  it("clears the viewer when the only image in the folder is deleted", async () => {
    const { container } = renderLayout({
      "": [image("only.png")],
    });

    await selectImage(container, "only.png");
    expect(viewerSrc(container)).toBe("/api/images/only.png");

    deleteSelected(container);

    await waitFor(() => expect(viewerSrc(container)).toBeNull());
    expect(emptyViewer(container)).toBeInTheDocument();
    expect(container.querySelector(".file-browser-empty")).toBeInTheDocument();
    expect(container.querySelector(".file-browser-item")).toBeNull();
  });

  it("clears the viewer when only folders remain after an image delete", async () => {
    const { container } = renderLayout({
      "": [folder("archive"), image("only.png")],
    });

    await selectImage(container, "only.png");

    deleteSelected(container);

    await waitFor(() => expect(viewerSrc(container)).toBeNull());
    expect(emptyViewer(container)).toBeInTheDocument();
    // The folder is focused/selected in the list, but nothing is displayed
    expect(selectedItemNames(container)).toEqual(["archive"]);
  });

  it("applies the same selection rules when a folder is deleted", async () => {
    const { container } = renderLayout({
      "": [folder("archive"), image("img1.png"), image("img2.jpg")],
    });

    await waitFor(() => expect(itemByName(container, "archive")).toBeTruthy());
    fireEvent.click(itemByName(container, "archive"));

    deleteSelected(container);

    await waitFor(() =>
      expect(viewerSrc(container)).toBe("/api/images/img1.png"),
    );
    expect(selectedItemNames(container)).toEqual(["img1.png"]);
    expect(itemByName(container, "archive")).toBeNull();
  });

  it("clears the viewer when a deleted folder was the last one", async () => {
    const { container } = renderLayout({
      "": [folder("archive"), folder("keep")],
    });

    await waitFor(() => expect(itemByName(container, "archive")).toBeTruthy());
    fireEvent.click(itemByName(container, "archive"));

    deleteSelected(container);

    await waitFor(() => expect(viewerSrc(container)).toBeNull());
    expect(emptyViewer(container)).toBeInTheDocument();
    expect(selectedItemNames(container)).toEqual(["keep"]);
  });

  it("keeps the viewer untouched when the trash request fails", async () => {
    const { container, fetchMock } = renderLayout(
      { "": [image("img1.png"), image("img2.jpg")] },
      { trashResponse: apiResponse({ error: "Trash failed" }, 500) },
    );

    await selectImage(container, "img1.png");

    deleteSelected(container);

    await waitFor(() =>
      expect(
        container.querySelector(".file-browser-error"),
      ).toBeInTheDocument(),
    );

    expect(container.querySelector(".file-browser-error").textContent).toBe(
      "Trash failed",
    );
    expect(viewerSrc(container)).toBe("/api/images/img1.png");
    expect(container.querySelector(".image-viewer-empty")).toBeNull();
    // No listing refresh happens when the trash call fails
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/fs/"),
      ),
    ).toHaveLength(1);
  });

  it("treats a per-path failure inside the 200 trash body as an error", async () => {
    // server.mjs always answers 200; failures live in the body
    const { container, fetchMock } = renderLayout(
      { "": [image("img1.png"), image("img2.jpg")] },
      {
        trashResponse: apiResponse({
          ok: false,
          errors: [{ path: "img1.png", error: "Not found" }],
        }),
      },
    );

    await selectImage(container, "img1.png");

    deleteSelected(container);

    await waitFor(() =>
      expect(
        container.querySelector(".file-browser-error"),
      ).toBeInTheDocument(),
    );
    expect(container.querySelector(".file-browser-error").textContent).toBe(
      "Not found",
    );
    // Nothing was moved, so the viewer and the listing stay as they were
    expect(viewerSrc(container)).toBe("/api/images/img1.png");
    expect(container.querySelector(".image-viewer-empty")).toBeNull();
    expect(itemByName(container, "img1.png")).toBeTruthy();
    // ...and the listing is not refreshed
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/fs/"),
      ),
    ).toHaveLength(1);
  });

  it("reports an error and keeps the viewer when the trash call throws", async () => {
    const { container } = renderLayout(
      { "": [image("img1.png"), image("img2.jpg")] },
      { trashError: new Error("network down") },
    );

    await selectImage(container, "img1.png");

    deleteSelected(container);

    await waitFor(() =>
      expect(
        container.querySelector(".file-browser-error"),
      ).toBeInTheDocument(),
    );
    expect(container.querySelector(".file-browser-error").textContent).toBe(
      "Failed to move item to trash",
    );
    expect(viewerSrc(container)).toBe("/api/images/img1.png");
  });

  it("clears the viewer when the trash succeeds but the refresh fails", async () => {
    const { container } = renderLayout(
      { "": [image("img1.png"), image("img2.jpg")] },
      { fsFailOnCall: 2 },
    );

    await selectImage(container, "img1.png");

    deleteSelected(container);

    await waitFor(() =>
      expect(
        container.querySelector(".file-browser-error"),
      ).toBeInTheDocument(),
    );
    // The real error is the listing failure, not a trash failure
    expect(container.querySelector(".file-browser-error").textContent).toBe(
      "Directory not found",
    );
    // The trashed image cannot be displayed any more
    expect(viewerSrc(container)).toBeNull();
    expect(emptyViewer(container)).toBeInTheDocument();
  });

  it("uses the current folder path when trashing and refreshes that folder", async () => {
    const { container, state } = renderLayout({
      "": [folder("subfolder")],
      subfolder: [image("a.png"), image("b.png")],
    });

    await waitFor(() =>
      expect(itemByName(container, "subfolder")).toBeTruthy(),
    );
    fireEvent.doubleClick(itemByName(container, "subfolder"));
    await waitFor(() => expect(itemByName(container, "a.png")).toBeTruthy());

    await selectImage(container, "a.png");
    expect(viewerSrc(container)).toBe("/api/images/subfolder%2Fa.png");

    deleteSelected(container);

    await waitFor(() =>
      expect(viewerSrc(container)).toBe("/api/images/subfolder%2Fb.png"),
    );
    expect(state.trashed).toEqual(["subfolder/a.png"]);
    expect(selectedItemNames(container)).toEqual(["b.png"]);
  });

  it("falls back to the parent entry and clears the viewer in an emptied subfolder", async () => {
    const { container, state } = renderLayout({
      "": [folder("subfolder")],
      subfolder: [image("a.png")],
    });

    await waitFor(() =>
      expect(itemByName(container, "subfolder")).toBeTruthy(),
    );
    fireEvent.doubleClick(itemByName(container, "subfolder"));
    await waitFor(() => expect(itemByName(container, "a.png")).toBeTruthy());

    await selectImage(container, "a.png");

    deleteSelected(container);

    await waitFor(() => expect(viewerSrc(container)).toBeNull());
    expect(emptyViewer(container)).toBeInTheDocument();
    expect(state.trashed).toEqual(["subfolder/a.png"]);
    // The only remaining list entry is the virtual parent folder
    expect(selectedItemNames(container)).toEqual(["Parent folder"]);
    expect(itemByName(container, "a.png")).toBeNull();
  });

  it("clears the viewer when only the server's .trash folder is left", async () => {
    const { container } = renderLayout(
      { "": [image("only.png")] },
      { serverCreatesTrash: true },
    );

    await selectImage(container, "only.png");
    expect(viewerSrc(container)).toBe("/api/images/only.png");

    deleteSelected(container);

    await waitFor(() => expect(viewerSrc(container)).toBeNull());
    expect(emptyViewer(container)).toBeInTheDocument();
    // handleFS lists the .trash directory the server creates, so the folder is
    // not literally empty; still, no image remains, so the viewer is cleared.
    expect(itemByName(container, ".trash")).toBeTruthy();
    expect(selectedItemNames(container)).toEqual([".trash"]);
  });

  it("ignores a second Delete keypress while a delete is in flight", async () => {
    const { container, fetchMock } = renderLayout({
      "": [image("img1.png"), image("img2.jpg")],
    });

    await selectImage(container, "img1.png");

    deleteSelected(container);
    deleteSelected(container);

    await waitFor(() =>
      expect(viewerSrc(container)).toBe("/api/images/img2.jpg"),
    );

    const trashCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/trash",
    );
    expect(trashCalls).toHaveLength(1);
    expect(JSON.parse(trashCalls[0][1].body).paths).toEqual(["img1.png"]);
    expect(itemByName(container, "img2.jpg")).toBeTruthy();
  });
});
