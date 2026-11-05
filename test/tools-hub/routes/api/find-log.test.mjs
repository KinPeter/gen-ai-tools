import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("tools-hub/routes/api/logging/find-log.mjs", () => ({
  default: vi.fn(() => ({
    testUrl: vi.fn(
      (url) =>
        url === "/api/logging/find-log" ||
        url.startsWith("/api/logging/find-log/"),
    ),
    serve: vi.fn(),
  })),
}));

vi.mock("../../../../logging/mongodb/find-log.mjs", () => ({
  findLogEntry: vi.fn(),
  normalizeFilename: vi.fn((name) =>
    String(name || "").replace(/\.(jpg|jpeg|png)$/i, ""),
  ),
}));

vi.mock("../../../../logging/mongodb/client.mjs", () => ({
  getImageLogConnection: vi.fn(),
}));

import {
  findLogEntry,
  normalizeFilename,
} from "../../../../logging/mongodb/find-log.mjs";
import { getImageLogConnection } from "../../../../logging/mongodb/client.mjs";
import apiLoggingFindLog, {
  serverFindLog,
} from "../../../../tools-hub/routes/api/logging/find-log.mjs";

afterEach(() => {
  vi.clearAllMocks();
});

const SAMPLE_ENTRY = {
  _id: "507f1f77bcf86cd799439011",
  filename: "rover-euler_20261101141233",
  steps: 20,
  prompt: "test prompt",
};

describe("apiLoggingFindLog", () => {
  it("returns a route object with testUrl and serve", () => {
    const route = apiLoggingFindLog();
    expect(typeof route.testUrl).toBe("function");
    expect(typeof route.serve).toBe("function");
  });

  describe("testUrl", () => {
    it("matches /api/logging/find-log exactly", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/find-log")).toBe(true);
    });

    it("matches /api/logging/find-log/ with trailing slash", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/find-log/")).toBe(true);
    });

    it("matches /api/logging/find-log?query", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/find-log?filename=test.jpg")).toBe(
        true,
      );
    });

    it("matches /api/logging/find-log/anything", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/find-log/something")).toBe(true);
    });

    it("does not match other API paths", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/")).toBe(false);
      expect(route.testUrl("/api/logging/find-logx")).toBe(false);
      expect(route.testUrl("/api/something/else")).toBe(false);
    });
  });

  describe("serve", () => {
    it("returns 400 when filename is missing", async () => {
      const route = apiLoggingFindLog();
      const mockReq = {
        url: "/api/logging/find-log",
        headers: { host: "localhost:4218" },
      };
      const mockRes = {
        statusCode: null,
        headers: {},
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };

      await route.serve(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(400, {
        "content-type": "application/json",
      });
      expect(mockRes.write).toHaveBeenCalledWith(
        JSON.stringify({ error: "Missing filename parameter" }),
      );
    });

    it("returns 404 when no log entry found", async () => {
      const route = apiLoggingFindLog();
      const mockReq = {
        url: "/api/logging/find-log?filename=test.jpg",
        headers: { host: "localhost:4218" },
      };
      const mockRes = {
        statusCode: null,
        headers: {},
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };

      normalizeFilename.mockReturnValue("test");
      const mockConnection = { client: { close: vi.fn() } };
      getImageLogConnection.mockResolvedValue(mockConnection);
      findLogEntry.mockResolvedValue(null);

      await route.serve(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, {
        "content-type": "application/json",
      });
      expect(mockRes.write).toHaveBeenCalledWith(
        JSON.stringify({ error: "No log entry found for: test.jpg" }),
      );
    });

    it("returns 200 with entry when found", async () => {
      const route = apiLoggingFindLog();
      const mockReq = {
        url: "/api/logging/find-log?filename=rover.jpg",
        headers: { host: "localhost:4218" },
      };
      const mockRes = {
        statusCode: null,
        headers: {},
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };

      normalizeFilename.mockReturnValue("rover");
      const mockConnection = { client: { close: vi.fn() } };
      getImageLogConnection.mockResolvedValue(mockConnection);
      findLogEntry.mockResolvedValue(SAMPLE_ENTRY);

      await route.serve(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        "content-type": "application/json",
      });
      expect(mockRes.write).toHaveBeenCalledWith(JSON.stringify(SAMPLE_ENTRY));
      expect(mockConnection.client.close).toHaveBeenCalledTimes(1);
    });

    it("returns 500 when findLogEntry throws", async () => {
      const route = apiLoggingFindLog();
      const mockReq = {
        url: "/api/logging/find-log?filename=error.jpg",
        headers: { host: "localhost:4218" },
      };
      const mockRes = {
        statusCode: null,
        headers: {},
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };

      const error = new Error("database error");
      normalizeFilename.mockReturnValue("error");
      const mockConnection = { client: { close: vi.fn() } };
      getImageLogConnection.mockResolvedValue(mockConnection);
      findLogEntry.mockRejectedValue(error);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await route.serve(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(500, {
        "content-type": "application/json",
      });
      expect(mockRes.write).toHaveBeenCalledWith(
        JSON.stringify({ error: "database error" }),
      );
      errorSpy.mockRestore();
    });

    it("handles filename with query string", async () => {
      const route = apiLoggingFindLog();
      const mockReq = {
        url: "/api/logging/find-log?filename=test.jpg&extra=param",
        headers: { host: "localhost:4218" },
      };
      const mockRes = {
        statusCode: null,
        headers: {},
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };

      normalizeFilename.mockReturnValue("test");
      const mockConnection = { client: { close: vi.fn() } };
      getImageLogConnection.mockResolvedValue(mockConnection);
      findLogEntry.mockResolvedValue(SAMPLE_ENTRY);

      await route.serve(mockReq, mockRes);

      expect(normalizeFilename).toHaveBeenCalledWith("test.jpg");
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        "content-type": "application/json",
      });
    });
  });

  describe("serverFindLog composition", () => {
    it("calls normalizeFilename, getImageLogConnection, and findLogEntry in sequence", async () => {
      normalizeFilename.mockReturnValue("rover");
      const mockConnection = {
        client: { close: vi.fn() },
      };
      getImageLogConnection.mockResolvedValue(mockConnection);
      findLogEntry.mockResolvedValue(SAMPLE_ENTRY);

      const result = await serverFindLog("rover.jpg");

      expect(normalizeFilename).toHaveBeenCalledWith("rover.jpg");
      expect(getImageLogConnection).toHaveBeenCalled();
      expect(findLogEntry).toHaveBeenCalledWith("rover", mockConnection);
      expect(mockConnection.client.close).toHaveBeenCalled();
      expect(result).toEqual(SAMPLE_ENTRY);
    });

    it("returns null when filename is empty after normalization", async () => {
      normalizeFilename.mockReturnValue("");
      const mockConnection = {
        client: { close: vi.fn() },
      };
      getImageLogConnection.mockResolvedValue(mockConnection);

      const result = await serverFindLog("");

      expect(normalizeFilename).toHaveBeenCalledWith("");
      // getImageLogConnection is NOT called when stripped filename is empty (early return)
      expect(getImageLogConnection).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("closes client even when findLogEntry throws", async () => {
      normalizeFilename.mockReturnValue("error");
      const mockConnection = {
        client: { close: vi.fn() },
      };
      getImageLogConnection.mockResolvedValue(mockConnection);
      findLogEntry.mockRejectedValue(new Error("db error"));

      await expect(serverFindLog("error.jpg")).rejects.toThrow("db error");

      expect(mockConnection.client.close).toHaveBeenCalled();
    });
  });
});
