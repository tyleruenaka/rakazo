// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { ActiveBotGlyph, CollaborationMarker } from "./CollaborationMarker";

function chipOf(html: string) {
  const host = new DOMParser().parseFromString(html, "text/html").body;
  const chip = host.querySelector<HTMLButtonElement>('[data-testid="peer-receipt-chip"]');
  if (!chip) throw new Error("peer chip not found");
  return { host, chip };
}

describe("collaboration transcript markers", () => {
  it("keeps the label outside a chip holding only the peer's avatar and name", () => {
    const html = renderToString(
      <CollaborationMarker
        ariaLabel="Message from Research"
        color="#14B8A6"
        identity="research"
        peer="Research"
        sent={false}
        onClick={() => undefined}
      />,
    );
    const { host, chip } = chipOf(html);

    expect(host.textContent).toBe("Message from Research");
    expect(chip.textContent).toBe("Research");
    expect(chip.getAttribute("aria-label")).toBe("Message from Research");
    expect(chip.title).toBe("Research");
    expect(chip.querySelector(".rakazo-organic-avatar")).not.toBeNull();
    expect(chip.querySelector(".truncate")?.textContent).toBe("Research");
    expect(html).not.toContain("{peer}");
  });

  it("names the outgoing exchange the same way", () => {
    const { host, chip } = chipOf(
      renderToString(
        <CollaborationMarker
          ariaLabel="Messaged Otto"
          color="#14B8A6"
          identity="otto"
          peer="Otto"
          sent
          onClick={() => undefined}
        />,
      ),
    );
    expect(host.textContent).toBe("Messaged Otto");
    expect(chip.textContent).toBe("Otto");
  });

  it("styles the chip as a 24px pill that fills on hover and keyboard focus", () => {
    const { chip } = chipOf(
      renderToString(
        <CollaborationMarker
          ariaLabel="Message from Research"
          color="#14B8A6"
          identity="research"
          peer="Research"
          sent={false}
          onClick={() => undefined}
        />,
      ),
    );
    const classes = chip.className.split(" ");
    for (const name of [
      "h-6",
      "rounded-full",
      "ps-1",
      "pe-1.5",
      "gap-1",
      "text-muted-foreground",
      "hover:bg-muted",
      "hover:text-foreground",
      "focus-visible:bg-muted",
      "focus-visible:text-foreground",
      "outline-none",
      "transition-colors",
      "duration-[120ms]",
    ]) {
      expect(classes).toContain(name);
    }
    expect(chip.className).not.toContain("underline");
  });

  it("adds a collapsed toggle only when the marker has folded replies", () => {
    const marker = (replies?: { expanded: boolean; label: string; onToggle: () => void }) =>
      renderToString(
        <CollaborationMarker
          ariaLabel="Message from Research"
          color="#14B8A6"
          identity="research"
          peer="Research"
          sent={false}
          onClick={() => undefined}
          replies={replies}
        />,
      );

    expect(marker()).not.toContain("aria-expanded");
    const collapsed = marker({
      expanded: false,
      label: "Expand Message from Research",
      onToggle: () => undefined,
    });
    expect(collapsed).toContain('data-testid="peer-replies-toggle"');
    expect(collapsed).toContain('data-slot="button"');
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain('aria-label="Expand Message from Research"');
    expect(
      marker({
        expanded: true,
        label: "Collapse Message from Research",
        onToggle: () => undefined,
      }),
    ).toContain('aria-expanded="true"');
  });

  it("animates the active bot glyph from its run status", () => {
    const html = renderToString(
      <ActiveBotGlyph
        bots={[{ botId: "research", color: "#14B8A6", status: "running" }]}
        label="Research is working"
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('data-working="true"');
    expect(html).toContain("rakazo-organic-avatar-body-working");
  });
});
