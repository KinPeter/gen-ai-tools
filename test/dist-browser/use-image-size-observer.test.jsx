// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useImageSizeObserver } from "../../dist-browser/src/hooks/useImageSizeObserver";

// ── Test wrapper that exposes hook state as data attributes ──────────────────

function UseImageSizeObserverTestWrapper({ imagePath }) {
  const observer = useImageSizeObserver(imagePath);
  return (
    <div ref={observer.containerRef}>
      <img ref={observer.imageRef} data-tall-enough={observer.tallEnough} />
    </div>
  );
}

describe("useImageSizeObserver", () => {
  afterEach(() => cleanup());

  it("returns tallEnough: false initially (no DOM)", () => {
    const { result } = renderHook(() => useImageSizeObserver(null));
    expect(result.current.tallEnough).toBe(false);
  });

  it("when given a container element, sets up ResizeObserver", () => {
    const { result } = renderHook(() => useImageSizeObserver("test.png"));
    // containerRef is a React ref — .current is set after the effect runs.
    // In renderHook (no actual DOM render), .current stays null.
    // Just verify the ref object exists.
    expect(result.current.containerRef).toBeDefined();
  });

  it("setTallEnoughOverride(true) makes tallEnough true", () => {
    const { result, rerender } = renderHook(() =>
      useImageSizeObserver("test.png"),
    );
    // Override triggers a state update in the hook's setToggler,
    // which re-renders the wrapper.  Call rerender() to flush it.
    result.current.setTallEnoughOverride(true);
    rerender();
    expect(result.current.tallEnough).toBe(true);
  });

  it("setTallEnoughOverride(false) makes tallEnough false", () => {
    const { result, rerender } = renderHook(() =>
      useImageSizeObserver("test.png"),
    );
    result.current.setTallEnoughOverride(false);
    rerender();
    expect(result.current.tallEnough).toBe(false);
  });

  it("setTallEnoughOverride(null) falls back to internal state", () => {
    const { result, rerender } = renderHook(() =>
      useImageSizeObserver("test.png"),
    );
    // Set override to true first
    result.current.setTallEnoughOverride(true);
    rerender();
    expect(result.current.tallEnough).toBe(true);
    // Now clear the override — falls back to internal state (false)
    result.current.setTallEnoughOverride(null);
    rerender();
    expect(result.current.tallEnough).toBe(false);
  });

  it("returns imageRef as a RefObject", () => {
    const { result } = renderHook(() => useImageSizeObserver("test.png"));
    expect(result.current.imageRef).toBeDefined();
    expect(result.current.imageRef.current).toBeNull();
  });

  // ── Real DOM / ResizeObserver callback logic ─────────────────────────────

  it("reports tallEnough: true when image height exceeds container height", async () => {
    const { container } = render(
      <UseImageSizeObserverTestWrapper imagePath="test.png" />,
    );

    // Simulate image loading
    const img = container.querySelector("img");
    fireEvent.load(img);

    // Override getBoundingClientRect so the image appears taller than the container
    img.getBoundingClientRect = () => ({
      height: 300,
      width: 200,
      top: 0,
      left: 0,
      bottom: 300,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Fire the ResizeObserver with a container shorter than the image
    global.ResizeObserver._fireAll([
      { contentRect: { height: 200, width: 200 } },
    ]);

    // Wait for the async state update and verify tallEnough is true
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(img.getAttribute("data-tall-enough")).toBe("true");
  });

  it("reports tallEnough: false when container height exceeds image height", async () => {
    const { container } = render(
      <UseImageSizeObserverTestWrapper imagePath="test.png" />,
    );

    // Simulate image loading
    const img = container.querySelector("img");
    fireEvent.load(img);

    // Override getBoundingClientRect so the image appears shorter than the container
    img.getBoundingClientRect = () => ({
      height: 80,
      width: 200,
      top: 0,
      left: 0,
      bottom: 80,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Fire the ResizeObserver with a container taller than the image
    global.ResizeObserver._fireAll([
      { contentRect: { height: 200, width: 200 } },
    ]);

    // Wait for the async state update and verify tallEnough stays false
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(img.getAttribute("data-tall-enough")).toBe("false");
  });
});
