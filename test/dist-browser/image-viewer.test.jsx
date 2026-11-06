// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ImageViewer } from "../../dist-browser/src/components/ImageViewer/ImageViewer.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────

function renderImageViewer(props = {}) {
  const defaultProps = {
    imagePath: null,
    alt: undefined,
    ...props,
  };
  const result = render(<ImageViewer {...defaultProps} />);
  return {
    ...result,
    rerenderImageViewer: (nextProps) =>
      result.rerender(<ImageViewer {...defaultProps} {...nextProps} />),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("ImageViewer", () => {
  afterEach(() => cleanup());

  // ── Empty state ────────────────────────────────────────────────────────

  describe("empty state", () => {
    it('renders "No image selected" when imagePath is null', () => {
      const { getByRole } = renderImageViewer({ imagePath: null });
      const status = getByRole("status");
      expect(status.textContent).toBe("No image selected");
    });

    it('renders "No image selected" when imagePath is undefined', () => {
      const { getByRole } = renderImageViewer({ imagePath: undefined });
      const status = getByRole("status");
      expect(status.textContent).toBe("No image selected");
    });

    it('renders "No image selected" when imagePath is an empty string', () => {
      const { getByRole } = renderImageViewer({ imagePath: "" });
      const status = getByRole("status");
      expect(status.textContent).toBe("No image selected");
    });
  });

  // ── Rendering ──────────────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders an <img> with the /api/dist-browser/images/ src", () => {
      const { container } = renderImageViewer({
        imagePath: "folder/test.png",
        alt: "test.png",
      });
      const img = container.querySelector("img");
      expect(img).toBeTruthy();
      expect(img.src).toBe(
        `${window.location.origin}/api/dist-browser/images/folder%2Ftest.png`,
      );
    });

    it("uses the alt prop as the <img> alt text", () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
        alt: "My Photo",
      });
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("alt", "My Photo");
    });

    it("falls back to imagePath as alt when alt is missing", () => {
      const { container } = renderImageViewer({
        imagePath: "my-image.jpg",
      });
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("alt", "my-image.jpg");
    });

    it("URL-encodes the image path", () => {
      const { container } = renderImageViewer({
        imagePath: "path with spaces/image.png",
      });
      const img = container.querySelector("img");
      expect(img.src).toContain("path%20with%20spaces%2Fimage.png");
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────

  describe("loading state", () => {
    it("shows the loading indicator before the image loads", () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
      });
      const loadingEl = container.querySelector(".image-viewer-loading");
      expect(loadingEl).toBeTruthy();

      const spinner = container.querySelector(".image-viewer-spinner");
      expect(spinner).toBeTruthy();
    });

    it("hides the loading indicator after onLoad", async () => {
      const { container } = renderImageViewer({ imagePath: "test.png" });

      const img = container.querySelector("img");
      fireEvent.load(img);

      await waitFor(() => {
        expect(container.querySelector(".image-viewer-loading")).toBeFalsy();
      });
    });
  });

  // ── Error state ────────────────────────────────────────────────────────

  describe("error state", () => {
    it("renders the error text and retry button after onError", async () => {
      const { container } = renderImageViewer({ imagePath: "test.png" });

      const img = container.querySelector("img");
      fireEvent.error(img);

      await waitFor(() => {
        expect(container.querySelector(".image-viewer-error")).toBeTruthy();
        expect(container.querySelector(".image-viewer-retry")).toBeTruthy();
      });

      expect(container.querySelector(".image-viewer-error")).toHaveTextContent(
        "Failed to load image",
      );
    });

    it("hides the loading indicator on error", async () => {
      const { container } = renderImageViewer({ imagePath: "test.png" });

      const img = container.querySelector("img");
      fireEvent.error(img);

      await waitFor(() => {
        expect(container.querySelector(".image-viewer-loading")).toBeFalsy();
      });
    });

    it("retry button resets error state and changes img key", () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
      });

      // Trigger error
      const img = container.querySelector("img");
      fireEvent.error(img);

      // Click retry
      const retryBtn = container.querySelector(".image-viewer-retry");
      fireEvent.click(retryBtn);

      // Error state should be gone
      expect(container.querySelector(".image-viewer-error")).toBeFalsy();
      expect(container.querySelector(".image-viewer-loading")).toBeTruthy();
    });

    it("does not show filename label or overlay in error state", async () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
        alt: "test.png",
        isTallEnough: true,
      });

      const img = container.querySelector("img");
      fireEvent.error(img);

      await waitFor(() => {
        expect(
          container.querySelector(".image-viewer-filename-label"),
        ).toBeFalsy();
        expect(
          container.querySelector(".image-viewer-filename-overlay"),
        ).toBeFalsy();
      });
    });
  });

  // ── Filename label ─────────────────────────────────────────────────────

  describe("filename label (below image)", () => {
    it("is rendered when isTallEnough is false", () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
        alt: "My Photo",
        isTallEnough: false,
      });
      const label = container.querySelector(".image-viewer-filename-label");
      expect(label).toBeTruthy();
      expect(label.textContent).toBe("My Photo");
    });

    it("falls back to imagePath for the label text when alt is missing", () => {
      const { container } = renderImageViewer({
        imagePath: "some-file.jpg",
        isTallEnough: false,
      });
      const label = container.querySelector(".image-viewer-filename-label");
      expect(label.textContent).toBe("some-file.jpg");
    });

    it("is NOT rendered when isTallEnough is true", () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
        isTallEnough: true,
      });
      expect(
        container.querySelector(".image-viewer-filename-label"),
      ).toBeFalsy();
    });
  });

  // ── Filename overlay ───────────────────────────────────────────────────

  describe("filename overlay", () => {
    it("is rendered when isTallEnough is true", () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
        alt: "Tall Image",
        isTallEnough: true,
      });
      const overlay = container.querySelector(".image-viewer-filename-overlay");
      expect(overlay).toBeTruthy();
      expect(overlay.textContent).toBe("Tall Image");
    });

    it("falls back to imagePath when alt is missing", () => {
      const { container } = renderImageViewer({
        imagePath: "tall-file.png",
        isTallEnough: true,
      });
      const overlay = container.querySelector(".image-viewer-filename-overlay");
      expect(overlay.textContent).toBe("tall-file.png");
    });

    it("is NOT rendered when isTallEnough is false", () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
        isTallEnough: false,
      });
      expect(
        container.querySelector(".image-viewer-filename-overlay"),
      ).toBeFalsy();
    });
  });

  // ── Mutual exclusivity ─────────────────────────────────────────────────

  describe("label vs overlay", () => {
    it("never shows both the label and the overlay at the same time", () => {
      const { container: notTall } = renderImageViewer({
        imagePath: "test.png",
        alt: "photo",
        isTallEnough: false,
      });

      const { container: tall } = renderImageViewer({
        imagePath: "test.png",
        alt: "photo",
        isTallEnough: true,
      });

      const labelCountNotTall = notTall.querySelectorAll(
        ".image-viewer-filename-label, .image-viewer-filename-overlay",
      ).length;
      const labelCountTall = tall.querySelectorAll(
        ".image-viewer-filename-label, .image-viewer-filename-overlay",
      ).length;

      expect(labelCountNotTall).toBe(1);
      expect(labelCountTall).toBe(1);
    });
  });

  // ── ResizeObserver-driven state transition ─────────────────────────────

  describe("ResizeObserver callback", () => {
    it("transitions to overlay when observer reports image fills column", async () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
        alt: "Tall Test",
      });

      // Simulate the image loading
      const img = container.querySelector("img");
      fireEvent.load(img);

      // Override getBoundingClientRect so the image appears "tall enough"
      // (jsdom won't render real dimensions)
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

      // Fire the ResizeObserver with a container height that the image exceeds
      global.ResizeObserver._fireAll([
        { contentRect: { height: 200, width: 200 } },
      ]);

      await waitFor(() => {
        // Overlay should appear (proving isTallInternal state transitioned)
        expect(
          container.querySelector(".image-viewer-filename-overlay"),
        ).toBeTruthy();
        // Label should be gone
        expect(
          container.querySelector(".image-viewer-filename-label"),
        ).toBeFalsy();
      });
    });

    it("keeps the label when observer reports image does NOT fill column", async () => {
      const { container } = renderImageViewer({
        imagePath: "test.png",
        alt: "Short Test",
      });

      // Simulate the image loading
      const img = container.querySelector("img");
      fireEvent.load(img);

      // Override getBoundingClientRect so the image appears shorter than container
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

      await waitFor(() => {
        expect(
          container.querySelector(".image-viewer-filename-label"),
        ).toBeTruthy();
        expect(
          container.querySelector(".image-viewer-filename-overlay"),
        ).toBeFalsy();
      });
    });
  });
});
