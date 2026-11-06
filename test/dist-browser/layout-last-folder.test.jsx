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
import { LAST_FOLDER_KEY } from "../../dist-browser/src/utils/last-folder.mjs";

// --- Fixtures ---

const folder = (name) => ({ name, type: "folder", ext: "" });
const image = (name) => ({ name, type: "file", ext: name.split(".").pop() });

const rootListing = {
  "": [folder("random"), folder("archive"), image("root.png")],
  random: [image("a.png"), image("b.jpg")],
  archive: [folder("2024")],
  "archive/2024": [image("c.png")],
};

// --- API mock (mirrors the tools-hub dist-browser API responses) ---

function mockApi(listings, statuses = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const requestUrl = String(url);
    if (requestUrl === "/api/dist-browser/logs") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ entries: [], fileCount: 0 }),
      };
    }
    if (!requestUrl.startsWith("/api/dist-browser/fs/")) {
      throw new Error(`Unexpected request: ${requestUrl}`);
    }

    const path = decodeURIComponent(
      requestUrl.slice("/api/dist-browser/fs/".length),
    );

    // Statuses the tools-hub handlers can return for a path that exists in the
    // mock but is rejected (403) or temporarily broken (500).
    if (path in statuses) {
      const status = statuses[path];
      return {
        ok: false,
        status,
        json: async () => ({
          error:
            status === 403
              ? "Path escapes allowed directory"
              : "Failed to read directory",
        }),
      };
    }

    if (!(path in listings)) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "Directory not found" }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ path, entries: listings[path] ?? [] }),
    };
  });
}

// --- Helpers ---

function renderLayout(listings = rootListing, statuses = {}) {
  const fetchMock = mockApi(listings, statuses);
  const result = render(
    <ThemeProvider>
      <Layout />
    </ThemeProvider>,
  );
  return { ...result, fetchMock };
}

function itemByName(container, name) {
  return container.querySelector(`.file-browser-item[aria-label="${name}"]`);
}

function fetchedPaths(fetchMock) {
  return fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url !== "/api/dist-browser/logs");
}

async function waitForRootListing(container) {
  await waitFor(() => expect(itemByName(container, "random")).toBeTruthy());
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
  localStorage.clear();
});

// --- Tests ---

describe("Layout last visited folder", () => {
  it("stores nothing while the user stays at the dist root", async () => {
    const { container } = renderLayout();
    await waitForRootListing(container);

    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
  });

  it("stores the folder when the user navigates into it", async () => {
    const { container } = renderLayout();
    await waitForRootListing(container);

    fireEvent.doubleClick(itemByName(container, "random"));

    await waitFor(() =>
      expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("random"),
    );
    expect(itemByName(container, "a.png")).toBeTruthy();
  });

  it("removes the entry when the user navigates back to the dist root", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "random");
    const { container, fetchMock } = renderLayout();

    await waitFor(() => expect(itemByName(container, "a.png")).toBeTruthy());
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("random");

    fireEvent.click(container.querySelector(".file-browser-icon-parent"));

    await waitFor(() => expect(itemByName(container, "root.png")).toBeTruthy());
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
    expect(fetchedPaths(fetchMock)).toEqual([
      "/api/dist-browser/fs/random",
      "/api/dist-browser/fs/",
    ]);
  });

  it("removes the entry when the parent '..' is used from a nested folder", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "archive/2024");
    const { container } = renderLayout();

    await waitFor(() => expect(itemByName(container, "c.png")).toBeTruthy());

    fireEvent.keyDown(container.querySelector(".file-browser-list"), {
      key: "Backspace",
    });

    await waitFor(() => expect(itemByName(container, "2024")).toBeTruthy());
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("archive");

    fireEvent.click(container.querySelector(".file-browser-icon-parent"));

    await waitFor(() => expect(itemByName(container, "random")).toBeTruthy());
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
  });

  it("restores the stored folder when the page is reloaded", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "random");
    const { container, fetchMock } = renderLayout();

    await waitFor(() => expect(itemByName(container, "a.png")).toBeTruthy());
    expect(fetchedPaths(fetchMock)[0]).toBe("/api/dist-browser/fs/random");
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("random");
  });

  it("normalizes a stored path with a trailing slash on load", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "archive/2024/");
    const { container, fetchMock } = renderLayout();

    await waitFor(() => expect(itemByName(container, "c.png")).toBeTruthy());
    // Layout URL-encodes the path, so the nested "/" becomes %2F
    expect(fetchedPaths(fetchMock)[0]).toBe(
      "/api/dist-browser/fs/archive%2F2024",
    );
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("archive/2024");
  });

  it("treats legacy root markers in storage as the dist root", async () => {
    for (const stored of ["", "/", ".", "./"]) {
      localStorage.clear();
      localStorage.setItem(LAST_FOLDER_KEY, stored);

      const { container, fetchMock } = renderLayout();
      await waitForRootListing(container);

      expect(fetchedPaths(fetchMock)[0]).toBe("/api/dist-browser/fs/");
      expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
      cleanup();
    }
  });

  it("falls back to the dist root when the stored folder no longer exists", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "deleted-folder");
    const { container, fetchMock } = renderLayout();

    await waitFor(() => expect(itemByName(container, "random")).toBeTruthy());
    expect(fetchedPaths(fetchMock)).toEqual([
      "/api/dist-browser/fs/deleted-folder",
      "/api/dist-browser/fs/",
    ]);
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
  });

  it("never sends a tampered '..' value to the server", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "..");
    const { container, fetchMock } = renderLayout();

    await waitForRootListing(container);
    expect(fetchedPaths(fetchMock)).toEqual(["/api/dist-browser/fs/"]);
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
    expect(container.querySelector(".file-browser-error")).toBeNull();
  });

  it("clears the entry when the server rejects the stored path (403)", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "forbidden");
    const { container, fetchMock } = renderLayout(rootListing, {
      forbidden: 403,
    });

    await waitForRootListing(container);
    expect(fetchedPaths(fetchMock)).toEqual([
      "/api/dist-browser/fs/forbidden",
      "/api/dist-browser/fs/",
    ]);
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
  });

  it("keeps the entry when the failure is transient (500)", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "random");
    const { container, fetchMock } = renderLayout(rootListing, { random: 500 });

    await waitFor(() =>
      expect(container.querySelector(".file-browser-error")).toBeTruthy(),
    );
    expect(fetchedPaths(fetchMock)).toEqual(["/api/dist-browser/fs/random"]);
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("random");
  });

  it("writes the entry exactly once per navigation (Layout is the only writer)", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "random");

    // jsdom's localStorage methods are not own properties, so spying on them
    // is unreliable: wrap the real storage with a recording stub instead.
    const real = window.localStorage;
    const writes = [];
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (key) => real.getItem(key),
        setItem: (key, value) => {
          // Column widths and the theme also use storage: only record the
          // last-folder key so the counts below stay meaningful.
          if (key === LAST_FOLDER_KEY) writes.push(["setItem", key, value]);
          real.setItem(key, value);
        },
        removeItem: (key) => {
          if (key === LAST_FOLDER_KEY) writes.push(["removeItem", key]);
          real.removeItem(key);
        },
        clear: () => real.clear(),
      },
      writable: true,
    });

    try {
      const { container } = renderLayout();
      await waitFor(() => expect(itemByName(container, "a.png")).toBeTruthy());
      expect(writes).toEqual([["setItem", LAST_FOLDER_KEY, "random"]]);

      fireEvent.click(container.querySelector(".file-browser-icon-parent"));
      await waitFor(() =>
        expect(itemByName(container, "root.png")).toBeTruthy(),
      );

      expect(writes).toEqual([
        ["setItem", LAST_FOLDER_KEY, "random"],
        ["removeItem", LAST_FOLDER_KEY],
      ]);
      expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
    } finally {
      Object.defineProperty(window, "localStorage", {
        value: real,
        writable: true,
      });
    }
  });

  it("keeps the stored folder stable across repeated loads", async () => {
    localStorage.setItem(LAST_FOLDER_KEY, "random");

    const first = renderLayout();
    await waitFor(() =>
      expect(itemByName(first.container, "a.png")).toBeTruthy(),
    );
    cleanup();

    const second = renderLayout();
    await waitFor(() =>
      expect(itemByName(second.container, "b.jpg")).toBeTruthy(),
    );

    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("random");
    // Neither load falls back to the dist root: every listing request targets
    // the restored folder.
    expect(
      fetchedPaths(second.fetchMock).filter(
        (url) => url === "/api/dist-browser/fs/",
      ),
    ).toHaveLength(0);
  });
});
