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

// --- API mock (mirrors the tools-hub dist-browser API responses) ---

function apiResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/**
 * Reply for a `GET /api/logging/find-log` request, mirroring
 * tools-hub/api/logging/find-log.mjs: the `filename` query parameter is
 * required and the handler normalises it to the extension-less basename.
 */
function findLogReply(requestUrl, logStatus, logEntries) {
  if (logStatus) return apiResponse({ error: "Log lookup failed" }, logStatus);

  const filename =
    new URL(requestUrl, "http://localhost").searchParams.get("filename") || "";

  if (!filename)
    return apiResponse({ error: "Missing filename parameter" }, 400);

  const basename = filename
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "");
  const entry = logEntries[basename];

  return entry
    ? apiResponse(entry, 200)
    : apiResponse({ error: `No log entry found for: ${filename}` }, 404);
}

/**
 * Delays a log reply and rejects it when the request's signal is aborted, the
 * way a real `fetch` behaves. Without this a lookup superseded by a new
 * selection would still resolve and overwrite the cleared log state.
 */
function settleReply(reply, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(reply), 5);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(
        Object.assign(new Error("The operation was aborted"), {
          name: "AbortError",
        }),
      );
    });
  });
}

/**
 * Mock `/api/dist-browser/fs/<path>`, `/api/dist-browser/trash` and the
 * per-image log lookup `/api/logging/find-log?filename=<image>` against an
 * in-memory listing so a delete really removes the entry from the listing the
 * app re-fetches.
 *
 * `/api/dist-browser/trash` answers like the tools-hub trash handler: HTTP 200
 * with `{ ok, errors }`, per-path failures reported inside the body.
 *
 * `logEntries` maps a basename (no extension, the way the find-log endpoint
 * normalises it) to the generation log document to return for that image. The
 * map lives in the returned `state`, so a test can add a log written after an
 * image was selected and check that a refresh re-looks it up.
 * `logStatus` overrides the HTTP status of every log lookup, for failure paths.
 *
 * `trashResponse` overrides the trash reply (for HTTP failures),
 * `trashError` makes the trash request throw (for network failures),
 * `fsFailOnCall` fails the Nth (1-based) directory listing request, and
 * `serverCreatesTrash` makes the root listing contain the `.trash` folder the
 * tools-hub trash handler creates on the first trash call.
 */
function mockApi({
  listings,
  logEntries = {},
  logStatus = null,
  trashResponse = null,
  trashError = null,
  fsFailOnCall = null,
  serverCreatesTrash = false,
}) {
  // `logEntries` lives in the state so a test can add a log written after the
  // image was first selected and prove a refresh re-looks it up.
  const state = {
    listings: { ...listings },
    logEntries: { ...logEntries },
    trashed: [],
    fsCalls: 0,
  };

  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options = {}) => {
      const requestUrl = String(url);

      if (requestUrl.startsWith("/api/logging/find-log")) {
        return settleReply(
          findLogReply(requestUrl, logStatus, state.logEntries),
          options.signal,
        );
      }

      if (requestUrl.startsWith("/api/dist-browser/fs/")) {
        state.fsCalls += 1;
        if (fsFailOnCall === state.fsCalls) {
          return apiResponse({ error: "Directory not found" }, 500);
        }
        const path = decodeURIComponent(
          requestUrl.slice("/api/dist-browser/fs/".length),
        );
        return apiResponse({ path, entries: state.listings[path] ?? [] });
      }

      if (requestUrl === "/api/dist-browser/trash") {
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

// The TopBar refresh button is the layout's only refresh control.
function refreshButton(container) {
  return container.querySelector(`.topbar-button[aria-label="Refresh"]`);
}

function clickRefresh(container) {
  fireEvent.click(refreshButton(container));
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
    // No image is selected, so the log column has nothing to look up.
    expect(
      container.querySelector(".log-viewer-empty-text"),
    ).toBeInTheDocument();
    expect(container.querySelector(".log-viewer-loading-text")).toBeNull();
  });

  it("displays an image when it is clicked in the file list", async () => {
    const { container } = renderLayout({
      "": [folder("archive"), image("img1.png"), image("img2.jpg")],
    });

    await selectImage(container, "img2.jpg");

    expect(viewerSrc(container)).toBe("/api/dist-browser/images/img2.jpg");
    expect(container.querySelector(".image-viewer-empty")).toBeNull();
  });

  it("fetches and renders the generation log of the selected image", async () => {
    const { container, fetchMock } = renderLayout(
      { "": [image("img1.png"), image("img2.jpg")] },
      {
        logEntries: {
          img2: {
            filename: "img2",
            prompt: { text: "a dog" },
            generatedIn: "0:10",
          },
        },
      },
    );

    await selectImage(container, "img2.jpg");

    await waitFor(() =>
      expect(container.querySelector(".log-viewer-content")).toBeTruthy(),
    );
    expect(container.querySelector("pre code").textContent).toContain(
      '"a dog"',
    );

    // The lookup is a per-image find-log request, not a bulk log download.
    const logCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith("/api/logging/find-log"),
    );
    expect(String(logCall[0])).toBe("/api/logging/find-log?filename=img2.jpg");
    expect(logCall[1].cache).toBe("no-store");
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/dist-browser/logs"),
      ),
    ).toBe(false);
  });

  it("shows the no-log state when the lookup answers 404", async () => {
    const { container } = renderLayout({ "": [image("img1.png")] });

    await selectImage(container, "img1.png");

    await waitFor(() =>
      expect(container.querySelector(".log-viewer-no-match")).toBeTruthy(),
    );
    expect(container.querySelector(".log-viewer-error")).toBeNull();
  });

  it("shows an alert when the log lookup fails", async () => {
    const { container } = renderLayout(
      { "": [image("img1.png")] },
      { logStatus: 503 },
    );

    await selectImage(container, "img1.png");

    await waitFor(() =>
      expect(container.querySelector(".log-viewer-error")).toBeTruthy(),
    );
    expect(container.querySelector(".log-viewer-error").textContent).toBe(
      "Log lookup failed: Log lookup failed",
    );
    expect(
      container.querySelector(".log-viewer-empty").getAttribute("role"),
    ).toBe("alert");
  });

  it("re-looks up the log of the still-selected image when the folder is refreshed", async () => {
    const { container, state, fetchMock } = renderLayout(
      { "": [image("img1.png"), image("img2.jpg")] },
      { logEntries: { img2: { filename: "img2", prompt: { text: "first" } } } },
    );

    await selectImage(container, "img2.jpg");
    await waitFor(() =>
      expect(container.querySelector(".log-viewer-content")).toBeTruthy(),
    );
    expect(container.querySelector("pre code").textContent).toContain(
      '"first"',
    );

    // A log written after the image was selected must be fetched again on refresh.
    state.logEntries.img2 = { filename: "img2", prompt: { text: "second" } };

    clickRefresh(container);

    await waitFor(() => {
      const logUrls = fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.startsWith("/api/logging/find-log"));
      expect(logUrls).toHaveLength(2);
      expect(logUrls[1]).toBe("/api/logging/find-log?filename=img2.jpg");
    });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    // Refresh re-lists the folder and re-runs the lookup for the same image.
    expect(
      urls.filter((url) => url.startsWith("/api/dist-browser/fs/")),
    ).toHaveLength(2);
  });

  it("renders a log written after the selection when the refreshed listing fails", async () => {
    // The refreshed listing is made to fail so the selection is not reset by the
    // listing load: this isolates the refresh key bump, which re-looks up the
    // log for the image that is still displayed.
    const { container, state } = renderLayout(
      { "": [image("img2.jpg")] },
      {
        logEntries: { img2: { filename: "img2", prompt: { text: "first" } } },
        fsFailOnCall: 2,
      },
    );

    await selectImage(container, "img2.jpg");
    await waitFor(() =>
      expect(container.querySelector(".log-viewer-content")).toBeTruthy(),
    );
    expect(container.querySelector("pre code").textContent).toContain(
      '"first"',
    );

    state.logEntries.img2 = { filename: "img2", prompt: { text: "second" } };

    clickRefresh(container);

    await waitFor(() =>
      expect(container.querySelector("pre code").textContent).toContain(
        '"second"',
      ),
    );
  });

  it("refreshes the listing without a log lookup when nothing is selected", async () => {
    const { container, fetchMock } = renderLayout({ "": [image("img1.png")] });

    await waitFor(() => expect(itemByName(container, "img1.png")).toBeTruthy());

    clickRefresh(container);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).startsWith("/api/dist-browser/fs/"),
        ),
      ).toHaveLength(2),
    );
    // Nothing is selected, so refreshing the folder must not look up a log.
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/logging/find-log"),
      ),
    ).toBe(false);
  });

  it("clears the viewer when a folder is clicked while an image is displayed", async () => {
    const { container } = renderLayout({
      "": [folder("archive"), image("img1.png")],
    });

    await selectImage(container, "img1.png");
    expect(viewerSrc(container)).toBe("/api/dist-browser/images/img1.png");

    fireEvent.click(itemByName(container, "archive"));

    await waitFor(() => expect(viewerSrc(container)).toBeNull());
    expect(emptyViewer(container)).toBeInTheDocument();
    // The folder is the highlighted row, but no image or log is shown
    expect(selectedItemNames(container)).toEqual(["archive"]);
    // Selecting a folder clears the log column back to its "nothing selected"
    // state: no lookup is in flight and nothing is rendered.
    await waitFor(() =>
      expect(
        container.querySelector(".log-viewer-empty-text"),
      ).toBeInTheDocument(),
    );
    expect(container.querySelector(".log-viewer-empty-text").textContent).toBe(
      "No log entry",
    );
    expect(container.querySelector(".log-viewer-loading-text")).toBeNull();
    expect(container.querySelector(".log-viewer-content")).toBeNull();
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
    expect(viewerSrc(container)).toBe("/api/dist-browser/images/img2.jpg");

    deleteSelected(container);

    await waitFor(() =>
      expect(viewerSrc(container)).toBe("/api/dist-browser/images/img3.png"),
    );

    // The trashed image is gone from the list and no longer displayed
    expect(itemByName(container, "img2.jpg")).toBeNull();
    expect(state.trashed).toEqual(["img2.jpg"]);
    expect(selectedItemNames(container)).toEqual(["img3.png"]);
    // The viewer and the log column both follow the new selection
    expect(
      container.querySelector(".image-viewer-image").getAttribute("alt"),
    ).toBe("img3.png");
    // LogViewer re-looks-up the new selection and renders the "no log found"
    // state once that lookup answers 404.
    await waitFor(() =>
      expect(container.querySelector(".log-viewer-no-match")).toBeTruthy(),
    );
    expect(container.querySelector(".log-viewer-empty")).toBeTruthy();

    // Refreshed listing after the trash call
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(
      urls.filter((url) => url === "/api/dist-browser/trash"),
    ).toHaveLength(1);
    expect(
      urls.filter((url) => url.startsWith("/api/dist-browser/fs/")),
    ).toHaveLength(2);
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
      expect(viewerSrc(container)).toBe("/api/dist-browser/images/img2.jpg"),
    );
    expect(selectedItemNames(container)).toEqual(["img2.jpg"]);
    expect(itemByName(container, "img3.png")).toBeNull();
  });

  it("clears the viewer when the only image in the folder is deleted", async () => {
    const { container } = renderLayout({
      "": [image("only.png")],
    });

    await selectImage(container, "only.png");
    expect(viewerSrc(container)).toBe("/api/dist-browser/images/only.png");

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
      expect(viewerSrc(container)).toBe("/api/dist-browser/images/img1.png"),
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
    expect(viewerSrc(container)).toBe("/api/dist-browser/images/img1.png");
    expect(container.querySelector(".image-viewer-empty")).toBeNull();
    // No listing refresh happens when the trash call fails
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/dist-browser/fs/"),
      ),
    ).toHaveLength(1);
  });

  it("treats a per-path failure inside the 200 trash body as an error", async () => {
    // handleTrash always answers 200; failures live in the body
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
    expect(viewerSrc(container)).toBe("/api/dist-browser/images/img1.png");
    expect(container.querySelector(".image-viewer-empty")).toBeNull();
    expect(itemByName(container, "img1.png")).toBeTruthy();
    // ...and the listing is not refreshed
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/dist-browser/fs/"),
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
    expect(viewerSrc(container)).toBe("/api/dist-browser/images/img1.png");
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
    expect(viewerSrc(container)).toBe(
      "/api/dist-browser/images/subfolder%2Fa.png",
    );

    deleteSelected(container);

    await waitFor(() =>
      expect(viewerSrc(container)).toBe(
        "/api/dist-browser/images/subfolder%2Fb.png",
      ),
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
    expect(viewerSrc(container)).toBe("/api/dist-browser/images/only.png");

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
      expect(viewerSrc(container)).toBe("/api/dist-browser/images/img2.jpg"),
    );

    const trashCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/dist-browser/trash",
    );
    expect(trashCalls).toHaveLength(1);
    expect(JSON.parse(trashCalls[0][1].body).paths).toEqual(["img1.png"]);
    expect(itemByName(container, "img2.jpg")).toBeTruthy();
  });
});
