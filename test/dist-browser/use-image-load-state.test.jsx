// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useImageLoadState } from "../../dist-browser/src/hooks/useImageLoadState";

describe("useImageLoadState", () => {
  it("initially has isLoaded: false", () => {
    const { result } = renderHook(() => useImageLoadState());
    expect(result.current.isLoaded).toBe(false);
  });

  it("initially has hasError: false", () => {
    const { result } = renderHook(() => useImageLoadState());
    expect(result.current.hasError).toBe(false);
  });

  it("initially has imgKey: 0", () => {
    const { result } = renderHook(() => useImageLoadState());
    expect(result.current.imgKey).toBe(0);
  });

  it("isLoaded becomes true after onLoad()", async () => {
    const { result } = renderHook(() => useImageLoadState());
    result.current.onLoad();
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
  });

  it("hasError becomes true after onError()", async () => {
    const { result } = renderHook(() => useImageLoadState());
    result.current.onError();
    await waitFor(() => {
      expect(result.current.hasError).toBe(true);
    });
  });

  it("onLoad resets hasError to false", async () => {
    const { result } = renderHook(() => useImageLoadState());
    result.current.onError();
    await waitFor(() => {
      expect(result.current.hasError).toBe(true);
    });
    result.current.onLoad();
    await waitFor(() => {
      expect(result.current.hasError).toBe(false);
    });
  });

  it("onRetry resets hasError to false", async () => {
    const { result } = renderHook(() => useImageLoadState());
    result.current.onError();
    await waitFor(() => {
      expect(result.current.hasError).toBe(true);
    });
    result.current.onRetry();
    await waitFor(() => {
      expect(result.current.hasError).toBe(false);
    });
  });

  it("onRetry increments imgKey", async () => {
    const { result } = renderHook(() => useImageLoadState());
    expect(result.current.imgKey).toBe(0);
    result.current.onRetry();
    await waitFor(() => {
      expect(result.current.imgKey).toBe(1);
    });
    result.current.onRetry();
    await waitFor(() => {
      expect(result.current.imgKey).toBe(2);
    });
  });
});
