// @vitest-environment jsdom

import type { PeerMarkerGroup } from "@rakazo/core";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  Plural: ({ value, one, other }: { value: number; one: string; other: string }) =>
    (value === 1 ? one : other).replace("#", String(value)),
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) => String.raw(parts, ...values),
  }),
}));

import {
  ActiveBotGlyph,
  CollaborationMarker,
  CollaborationMarkerGroup,
} from "./CollaborationMarker";

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

  it("fills its row so it stays centered inside end-aligned user messages", () => {
    const { host } = chipOf(
      renderToString(
        <CollaborationMarker
          ariaLabel="Message from Ezra"
          color="#14B8A6"
          identity="ezra"
          peer="Ezra"
          sent={false}
          onClick={() => undefined}
          replies={{
            expanded: false,
            label: "Expand Message from Ezra",
            onToggle: () => undefined,
          }}
        />,
      ),
    );
    const row = host.querySelector('[data-testid="peer-marker"]');
    expect(row?.classList.contains("w-full")).toBe(true);
    expect(row?.classList.contains("justify-center")).toBe(true);
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

describe("grouped collaboration markers", () => {
  const otto = { id: "otto", name: "Otto" };
  const ezra = { id: "ezra", name: "Ezra" };
  const riley = { id: "riley", name: "Riley" };
  const group = (summary: PeerMarkerGroup["summary"]) => {
    const html = renderToString(
      <CollaborationMarkerGroup summary={summary} peerColor={() => "#14B8A6"} onOpen={vi.fn()} />,
    );
    return new DOMParser().parseFromString(html, "text/html").body;
  };

  it("counts the messages and names one bot with one chip", () => {
    const host = group({ kind: "thread", messageCount: 2, peers: [otto] });
    expect(host.textContent).toBe("2 messages withOtto");
    expect(host.querySelectorAll('[data-testid="peer-receipt-chip"]')).toHaveLength(1);
  });

  it("joins two bots with a dimmer and", () => {
    const host = group({ kind: "thread", messageCount: 3, peers: [otto, ezra] });
    expect(host.textContent).toBe("3 messages withOttoandEzra");
    const and = [...host.querySelectorAll("span")].find((span) => span.textContent === "and");
    expect(and?.className).toBe("text-placeholder");
    expect(
      [...host.querySelectorAll('[data-testid="peer-receipt-chip"]')].map((c) => c.textContent),
    ).toEqual(["Otto", "Ezra"]);
  });

  it("fills its row so it stays centered inside end-aligned user messages", () => {
    const row = group({ kind: "fanout", messageCount: 2, peers: [otto, ezra] }).querySelector(
      '[data-testid="peer-marker-group"]',
    );
    expect(row?.classList.contains("w-full")).toBe(true);
    expect(row?.classList.contains("justify-center")).toBe(true);
    expect(row?.textContent?.startsWith("Messaged")).toBe(true);
  });

  it("shows three or more bots as one stacked chip", () => {
    const peers = [riley, otto, ezra, { id: "quinn", name: "Quinn" }];
    const host = group({ kind: "fanout", messageCount: 4, peers });
    const chip = host.querySelector<HTMLElement>('[data-testid="peer-group-chip"]');
    expect(host.querySelector('[data-testid="peer-receipt-chip"]')).toBeNull();
    expect(chip?.textContent).toBe("4 Bots");
    expect(chip?.getAttribute("aria-label")).toBe("4 Bots, show list");
    // At most three discs; each but the last is cut where the next one overlaps it.
    const discs = [...(chip?.querySelectorAll(".rakazo-organic-avatar") ?? [])];
    expect(discs).toHaveLength(3);
    expect(discs.map((disc) => disc.classList.contains("-mr-1.5"))).toEqual([true, true, false]);
  });

  it("opens a menu of every bot and opens the chosen exchange", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    const onOpen = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CollaborationMarkerGroup
          summary={{ kind: "fanout", messageCount: 3, peers: [riley, otto, ezra] }}
          peerColor={() => "#14B8A6"}
          onOpen={onOpen}
        />,
      );
    });
    const chip = container.querySelector<HTMLButtonElement>('[data-testid="peer-group-chip"]')!;

    await act(async () => chip.click());
    const menu = document.querySelector('[role="menu"]');
    expect(menu?.getAttribute("aria-label")).toBe("Bots in this exchange");
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual(["Riley", "Otto", "Ezra"]);
    expect(items[0]?.querySelector(".rakazo-organic-avatar")?.getAttribute("style")).toContain(
      "width: 18px",
    );

    await act(async () => items[1]?.click());
    expect(onOpen).toHaveBeenCalledWith(otto);

    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});
