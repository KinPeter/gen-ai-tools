// Layout deviation from the mirror: this file tests
// tools-hub/static/distbrowser/index.mjs and sits flat under
// test/tools-hub/static/, matching the local convention used for
// assets.test.mjs and logfinder.test.mjs.
import http from "node:http";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createServerInstance } from "../../../tools-hub/server.mjs";
import distbrowser from "../../../tools-hub/static/distbrowser/index.mjs";

/**
 * `distbrowser()` defaults its dist dir to the repository's
 * `dist-browser/dist`, which tests must never read. The two filesystem calls
 * the route makes are stubbed for that path only; every other path (the
 * tmpdir fixtures used by the rest of this file) is delegated to the real
 * filesystem. `repoDistStub` is filled by the mock factory, which runs before
 * any test body.
 */
var repoDistStub;

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  const { resolveRepoRoot } =
    await import("../../../tools-hub/utils/index.mjs");
  const repoDistDir = resolveRepoRoot("dist-browser/dist");

  repoDistStub = { distDir: repoDistDir, exists: false, files: {} };

  const isRepoDistPath = (target) => String(target).startsWith(repoDistDir);

  return {
    ...actual,
    existsSync: (target) =>
      isRepoDistPath(target) ? repoDistStub.exists : actual.existsSync(target),
    readFileSync: (target) => {
      if (!isRepoDistPath(target)) return actual.readFileSync(target);

      const contents = repoDistStub.files[String(target)];
      if (contents === undefined) {
        throw Object.assign(new Error("ENOENT: stubbed dist dir is empty"), {
          code: "ENOENT",
        });
      }

      return Buffer.from(contents);
    },
  };
});

/**
 * Create a throwaway stand-in for the Vite build output directory so the
 * route is exercised against real files without touching the repository.
 *
 * @param {object} options
 * @param {Record<string, string>} [options.files] - relative path -> contents
 * @param {string[]} [options.dirs] - empty directories to create
 */
async function makeDistDir({ files = {}, dirs = [] } = {}) {
  const distDir = await mkdtemp(path.join(os.tmpdir(), "distbrowser-test-"));

  for (const dir of dirs) {
    await mkdir(path.join(distDir, dir), { recursive: true });
  }

  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(distDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }

  return distDir;
}

function createResponse() {
  return { writeHead: vi.fn(), end: vi.fn() };
}

function serve(route, req) {
  const res = createResponse();
  route.serve(req, res);
  return res;
}

/** Body written by the last `end` call, as a string. */
function body(res) {
  return res.end.mock.calls.map((args) => String(args[0])).join("");
}

/** Issue a real request against the running tools-hub server. */
function request(port, method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath, method },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            contentType: res.headers["content-type"],
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );

    req.on("error", reject);
    req.end();
  });
}

describe("distbrowser static route", () => {
  let distDir = null;
  let outsideDir = null;
  let server = null;

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }

    for (const dir of [distDir, outsideDir]) {
      if (dir) await rm(dir, { recursive: true, force: true });
    }

    distDir = null;
    outsideDir = null;
    repoDistStub.exists = false;
    repoDistStub.files = {};
  });

  describe("route contract", () => {
    it("is a factory returning testUrl and serve", () => {
      const route = distbrowser("/tmp/does-not-matter");
      expect(typeof route.testUrl).toBe("function");
      expect(typeof route.serve).toBe("function");
    });

    it("matches the mount path and everything below it", () => {
      const route = distbrowser("/tmp/does-not-matter");

      expect(route.testUrl("/distbrowser")).toBe(true);
      expect(route.testUrl("/distbrowser/")).toBe(true);
      expect(route.testUrl("/distbrowser/index.html")).toBe(true);
      expect(route.testUrl("/distbrowser/assets/app.js")).toBe(true);
    });

    it("ignores the query string when matching", () => {
      const route = distbrowser("/tmp/does-not-matter");

      expect(route.testUrl("/distbrowser?tab=images")).toBe(true);
      expect(route.testUrl("/distbrowser/assets/app.js?v=2")).toBe(true);
    });

    it("does not match near misses or unrelated paths", () => {
      const route = distbrowser("/tmp/does-not-matter");

      expect(route.testUrl("/distbrowserX")).toBe(false);
      expect(route.testUrl("/distbrowse")).toBe(false);
      expect(route.testUrl("/assets/distbrowser")).toBe(false);
      expect(route.testUrl("/")).toBe(false);
    });

    it("does not match a missing or empty url", () => {
      const route = distbrowser("/tmp/does-not-matter");

      expect(route.testUrl(undefined)).toBe(false);
      expect(route.testUrl("")).toBe(false);
    });
  });

  describe("default dist directory", () => {
    it("uses the repository dist-browser/dist output when no dir is given", () => {
      const route = distbrowser();

      expect(route.testUrl("/distbrowser")).toBe(true);

      const res = serve(route, {
        method: "GET",
        url: "/distbrowser/index.html",
      });

      expect(res.writeHead).toHaveBeenCalledWith(404, {
        "Content-Type": "text/plain",
      });
      expect(body(res)).toContain(repoDistStub.distDir);
      expect(repoDistStub.distDir).toContain(path.join("dist-browser", "dist"));
    });

    it("serves the entry file from the default dist directory when it exists", () => {
      repoDistStub.exists = true;
      repoDistStub.files = {
        [path.join(repoDistStub.distDir, "index.html")]:
          "<html>repo SPA</html>",
      };

      const res = serve(distbrowser(), {
        method: "GET",
        url: "/distbrowser/some/spa/route",
      });

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
      expect(body(res)).toBe("<html>repo SPA</html>");
    });
  });

  describe("serving built artifacts", () => {
    it("serves the SPA entry file for the mount path itself", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser",
      });

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
      expect(res.end).toHaveBeenCalledWith(Buffer.from("<html>SPA</html>"));
    });

    it("serves a deep SPA route by falling back to index.html", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser/images/42",
      });

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
      expect(res.end).toHaveBeenCalledWith(Buffer.from("<html>SPA</html>"));
    });

    it("serves asset files with the content type and body of their extension", async () => {
      distDir = await makeDistDir({
        files: {
          "index.html": "<html>SPA</html>",
          "assets/app.js": "console.log('app')",
          "assets/style.css": "body{}",
          "assets/logo.png": "png-bytes",
        },
      });

      const route = distbrowser(distDir);

      const js = serve(route, {
        method: "GET",
        url: "/distbrowser/assets/app.js",
      });
      expect(js.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "application/javascript; charset=utf-8",
      });
      expect(js.end).toHaveBeenCalledWith(Buffer.from("console.log('app')"));

      const css = serve(route, {
        method: "GET",
        url: "/distbrowser/assets/style.css",
      });
      expect(css.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/css; charset=utf-8",
      });
      expect(css.end).toHaveBeenCalledWith(Buffer.from("body{}"));

      const png = serve(route, {
        method: "GET",
        url: "/distbrowser/assets/logo.png",
      });
      expect(png.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "image/png",
      });
      expect(png.end).toHaveBeenCalledWith(Buffer.from("png-bytes"));
    });

    it("uses the binary content type for unknown extensions", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>", "blob.unknown": "bytes" },
      });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser/blob.unknown",
      });

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "application/octet-stream",
      });
      expect(res.end).toHaveBeenCalledWith(Buffer.from("bytes"));
    });

    it("keeps the query string out of the file it reads", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>", "assets/app.js": "app" },
      });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser/assets/app.js?version=123",
      });

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "application/javascript; charset=utf-8",
      });
      expect(res.end).toHaveBeenCalledWith(Buffer.from("app"));
    });

    it("treats a request without a method as GET", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });

      const res = serve(distbrowser(distDir), {
        url: "/distbrowser/index.html",
      });

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
    });

    it("treats a request with no url as the mount root", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });

      const res = serve(distbrowser(distDir), { method: "GET" });

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
      expect(res.end).toHaveBeenCalledWith(Buffer.from("<html>SPA</html>"));
    });
  });

  describe("HEAD requests", () => {
    it("answers HEAD like GET for status and content type", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      const route = distbrowser(distDir);

      const get = serve(route, {
        method: "GET",
        url: "/distbrowser/index.html",
      });
      const head = serve(route, {
        method: "HEAD",
        url: "/distbrowser/index.html",
      });

      expect(head.writeHead).toHaveBeenCalledWith(
        ...get.writeHead.mock.calls[0],
      );
      expect(head.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
    });

    it("answers HEAD like GET for the SPA fallback route", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      const route = distbrowser(distDir);

      const get = serve(route, {
        method: "GET",
        url: "/distbrowser/images/42",
      });
      const head = serve(route, {
        method: "HEAD",
        url: "/distbrowser/images/42",
      });

      expect(head.writeHead).toHaveBeenCalledWith(
        ...get.writeHead.mock.calls[0],
      );
    });

    it("returns 403 for a HEAD traversal attempt", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });

      const res = serve(distbrowser(distDir), {
        method: "HEAD",
        url: "/distbrowser/../index.html",
      });

      expect(res.writeHead).toHaveBeenCalledWith(403, {
        "Content-Type": "text/plain",
      });
      expect(res.end).toHaveBeenCalledWith("Forbidden");
    });
  });

  describe("when the UI has not been built", () => {
    it("returns a 404 hint naming the build command and the skip env var", async () => {
      distDir = await makeDistDir({ files: { "README.txt": "no build yet" } });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser/index.html",
      });

      expect(res.writeHead).toHaveBeenCalledWith(404, {
        "Content-Type": "text/plain",
      });
      const hint = body(res);
      expect(hint).toContain("not built");
      expect(hint).toContain(distDir);
      expect(hint).toContain("npm run dist-browser:build");
      expect(hint).toContain("TOOLS_HUB_SKIP_UI_BUILD");
    });

    it("returns the hint when the dist directory does not exist at all", async () => {
      distDir = await mkdtemp(path.join(os.tmpdir(), "distbrowser-missing-"));
      await rm(distDir, { recursive: true, force: true });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser/",
      });

      expect(res.writeHead).toHaveBeenCalledWith(404, {
        "Content-Type": "text/plain",
      });
      expect(body(res)).toContain("not built");
      expect(body(res)).toContain(distDir);
    });

    it("treats a directory request as not found rather than serving it", async () => {
      distDir = await makeDistDir({ dirs: ["assets"] });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser/assets",
      });

      expect(res.writeHead).toHaveBeenCalledWith(404, {
        "Content-Type": "text/plain",
      });
      expect(body(res)).toContain("not built");
    });

    it("treats a path below a plain file as not found (ENOTDIR)", async () => {
      distDir = await makeDistDir({
        files: { "plain.txt": "not a directory" },
      });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser/plain.txt/child.js",
      });

      expect(res.writeHead).toHaveBeenCalledWith(404, {
        "Content-Type": "text/plain",
      });
      expect(body(res)).toContain("not built");
    });
  });

  describe("rejecting requests that do not belong to the dist directory", () => {
    it("returns 403 for a traversal attempt instead of the SPA fallback", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      outsideDir = await makeDistDir({ files: { "secret.txt": "TOP SECRET" } });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: `/distbrowser/../${path.basename(outsideDir)}/secret.txt`,
      });

      expect(res.writeHead).toHaveBeenCalledWith(403, {
        "Content-Type": "text/plain",
      });
      expect(res.end).toHaveBeenCalledWith("Forbidden");
      expect(body(res)).not.toContain("TOP SECRET");
    });

    it("returns 403 for an encoded traversal attempt", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      outsideDir = await makeDistDir({ files: { "secret.txt": "TOP SECRET" } });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: `/distbrowser/%2e%2e/${path.basename(outsideDir)}/secret.txt`,
      });

      expect(res.writeHead).toHaveBeenCalledWith(403, {
        "Content-Type": "text/plain",
      });
      expect(res.end).toHaveBeenCalledWith("Forbidden");
      expect(body(res)).not.toContain("TOP SECRET");
    });

    it("still serves a path that stays inside the dist dir despite its '..' segment", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>", "assets/app.js": "app" },
      });

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser/assets/../index.html",
      });

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
      expect(res.end).toHaveBeenCalledWith(Buffer.from("<html>SPA</html>"));
    });

    it("does not fall back to index.html when the read fails for a non-404 reason", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      await mkdir(path.join(distDir, "loop"), { recursive: true });
      await symlink(
        path.join(distDir, "loop", "b"),
        path.join(distDir, "loop", "a"),
      );
      await symlink(
        path.join(distDir, "loop", "a"),
        path.join(distDir, "loop", "b"),
      );

      const res = serve(distbrowser(distDir), {
        method: "GET",
        url: "/distbrowser/loop/a",
      });

      expect(res.writeHead).toHaveBeenCalledWith(500, {
        "Content-Type": "text/plain",
      });
      expect(res.end).toHaveBeenCalledWith("Internal Server Error");
    });
  });

  describe("method gating", () => {
    it("returns 405 for methods other than GET and HEAD", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      const route = distbrowser(distDir);

      for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
        const res = serve(route, { method, url: "/distbrowser/index.html" });
        expect(res.writeHead).toHaveBeenCalledWith(405, {
          "Content-Type": "text/plain",
        });
        expect(res.end).toHaveBeenCalledWith("Method Not Allowed");
      }
    });

    it("returns 405 rather than 403 for a traversal POST", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });

      const res = serve(distbrowser(distDir), {
        method: "POST",
        url: "/distbrowser/../index.html",
      });

      expect(res.writeHead).toHaveBeenCalledWith(405, {
        "Content-Type": "text/plain",
      });
      expect(res.end).toHaveBeenCalledWith("Method Not Allowed");
    });
  });

  describe("wired into the tools-hub server", () => {
    async function start(fixtureDir) {
      server = createServerInstance({ distBrowserUiDistDir: fixtureDir });
      await new Promise((resolve) => server.listen(0, resolve));
      return server.address().port;
    }

    it("serves the fixture UI through a real HTTP request", async () => {
      distDir = await makeDistDir({
        files: {
          "index.html": "<html>SPA</html>",
          "assets/app.js": "console.log('app')",
        },
      });
      const port = await start(distDir);

      const res = await request(port, "GET", "/distbrowser/index.html");

      expect(res.status).toBe(200);
      expect(res.contentType).toBe("text/html; charset=utf-8");
      expect(res.body).toBe("<html>SPA</html>");
    });

    it("serves distbrowser URLs through the server and 404s unmatched paths", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      const port = await start(distDir);

      const root = await request(port, "GET", "/distbrowser");
      expect(root.status).toBe(200);
      expect(root.body).toBe("<html>SPA</html>");

      const unmatched = await request(port, "GET", "/not-a-route");
      expect(unmatched.status).toBe(404);
      expect(unmatched.body).toBe("Not Found");
    });

    it("serves fixture assets over HTTP with their content type", async () => {
      distDir = await makeDistDir({
        files: {
          "index.html": "<html>SPA</html>",
          "assets/app.js": "console.log('app')",
        },
      });
      const port = await start(distDir);

      const res = await request(port, "GET", "/distbrowser/assets/app.js");

      expect(res.status).toBe(200);
      expect(res.contentType).toBe("application/javascript; charset=utf-8");
      expect(res.body).toBe("console.log('app')");
    });

    it("falls back to the SPA entry file for an unknown sub-path over HTTP", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      const port = await start(distDir);

      const res = await request(port, "GET", "/distbrowser/images/42");

      expect(res.status).toBe(200);
      expect(res.contentType).toBe("text/html; charset=utf-8");
      expect(res.body).toBe("<html>SPA</html>");
    });

    it("answers HEAD over HTTP like GET, without a body", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      const port = await start(distDir);

      const head = await request(port, "HEAD", "/distbrowser/index.html");
      expect(head.status).toBe(200);
      expect(head.contentType).toBe("text/html; charset=utf-8");
      expect(head.body).toBe("");
    });

    it("returns 403 for an encoded traversal over HTTP", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      outsideDir = await makeDistDir({ files: { "secret.txt": "TOP SECRET" } });
      const port = await start(distDir);

      const res = await request(
        port,
        "GET",
        `/distbrowser/%2e%2e/${path.basename(outsideDir)}/secret.txt`,
      );

      expect(res.status).toBe(403);
      expect(res.body).toBe("Forbidden");
    });

    it("uses the distBrowserUiDistDir override instead of the repo default", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>SPA</html>" },
      });
      const port = await start(distDir);

      const res = await request(port, "GET", "/distbrowser/index.html");

      expect(res.status).toBe(200);
      expect(res.body).toBe("<html>SPA</html>");
      expect(repoDistStub.files).toEqual({});
    });
  });
});
