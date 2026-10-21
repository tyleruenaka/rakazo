// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { AttachmentSummary, FileTypeIcon, formatAttachmentSize } from "./AttachmentCard";

beforeEach(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

function render(markup: string) {
  return new DOMParser().parseFromString(markup, "text/html").body;
}

describe("attachment cards", () => {
  it("formats sizes compactly with one decimal only under 10 kB", () => {
    expect(formatAttachmentSize(35)).toBe("35B");
    expect(formatAttachmentSize(9933)).toBe("9.7kB");
    expect(formatAttachmentSize(18 * 1024 + 300)).toBe("18kB");
    expect(formatAttachmentSize(1.25 * 1024 * 1024)).toBe("1.3MB");
  });

  it("keeps the extension visible while the base name truncates", () => {
    const body = render(
      renderToString(
        <AttachmentSummary name="quarterly.report.pdf" mimeType="application/pdf" size={381} />,
      ),
    );
    const base = body.querySelector(".truncate");
    expect(base?.textContent).toBe("quarterly.report");
    expect(base?.nextElementSibling?.textContent).toBe(".pdf");
    expect(base?.nextElementSibling?.className).toContain("shrink-0");
    expect(body.textContent).toBe("quarterly.report.pdf381B");
  });

  it("bands only PDF and spreadsheet icons", () => {
    const band = (mimeType: string) =>
      render(renderToString(<FileTypeIcon mimeType={mimeType} />)).querySelector(
        '[data-testid="file-icon-band"]',
      )?.className;
    expect(band("application/pdf")).toContain("bg-file-pdf");
    expect(band("text/csv")).toContain("bg-file-sheet");
    for (const mimeType of ["text/plain", "text/markdown", "application/zip", "audio/mpeg"]) {
      expect(band(mimeType)).toBeUndefined();
    }
  });
});
