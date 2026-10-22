import { ACTIVE_RUN_STATUSES } from "@rakazo/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarStyleProvider } from "./avatar-style.js";
import {
  BOT_AVATAR_COLORS,
  BotAvatar,
  BotShapePreview,
  botAvatarFill,
  botAvatarOutline,
  DEFAULT_BOT_AVATAR_COLOR,
  defaultBotAvatarValue,
  parseBotAvatar,
  resolvePersonaColorDef,
  resolvePersonaShape,
} from "./bot-avatar.js";
import { BotMotionProvider } from "./bot-motion.js";

describe("BotAvatar", () => {
  it("renders distinct SVG gradient IDs for concurrent working avatars", () => {
    const html = renderToString(
      <div>
        <BotAvatar color="#8B5CF6" status="running" animated variant="robot" />
        <BotAvatar color="#10B981" status="running" animated variant="robot" />
      </div>,
    );

    const gradMatches = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(gradMatches).toHaveLength(2);
    expect(new Set(gradMatches).size).toBe(2);
    for (const id of gradMatches) {
      expect(id).toBeTruthy();
      expect(html).toContain(`url(#${id})`);
    }
  });

  it.each([...ACTIVE_RUN_STATUSES])("marks active run status %s as working", (status) => {
    const html = renderToString(<BotAvatar color="#3B82F6" status={status} animated />);
    expect(html).toContain("<svg");
    expect(html).toContain('data-working="true"');
  });

  it("keeps working attribute false when idle", () => {
    const html = renderToString(<BotAvatar color="#F59E0B" status="idle" />);
    expect(html).toContain('data-working="false"');
  });

  it("fits the robot eyes inside the visor at every rendered size", () => {
    for (const size of [14, 15, 16, 18, 20, 21, 22, 25, 26, 28, 32, 38, 72, 76, 78, 120]) {
      const html = renderToString(
        <BotAvatar color={DEFAULT_BOT_AVATAR_COLOR} identity="maya" size={size} variant="robot" />,
      );
      const face = robotFaceFromHtml(html);
      expect(face.eyeW * 2 + face.eyeGap).toBeLessThanOrEqual(face.innerW);
      expect(face.eyeH).toBeLessThanOrEqual(face.innerH);
      expect(face.eyeW).toBeGreaterThan(0);
      expect(face.eyeH).toBeGreaterThan(0);
    }
  });

  it("keeps the robot face proportions from 28px up", () => {
    const face = robotFaceFromHtml(
      renderToString(
        <BotAvatar color={DEFAULT_BOT_AVATAR_COLOR} identity="maya" size={28} variant="robot" />,
      ),
    );
    expect(face.visorW).toBe(19);
    expect(face.visorH).toBe(12);
    expect(face.eyeW).toBe(4);
    expect(face.eyeH).toBe(7);
    expect(face.eyeGap).toBe(3);
  });

  it("renders the animated robot face for plain color values", () => {
    const html = renderToString(
      <BotAvatar
        color={DEFAULT_BOT_AVATAR_COLOR}
        identity="maya"
        size={28}
        variant="robot"
        status="running"
        animated
      />,
    );
    expect(html).toContain("rakazo-bot-avatar-visor");
    expect(html).toContain("rakazo-bot-avatar-eyes");
    expect(html).toContain("rakazo-eyes-idle-");
    expect(html).not.toContain("<ellipse");
    expect(html).toContain('data-working="true"');
  });

  it("renders distinct shapes for distinct bot identities", () => {
    const maya = renderToString(<BotAvatar color={DEFAULT_BOT_AVATAR_COLOR} identity="maya" />);
    const github = renderToString(<BotAvatar color={DEFAULT_BOT_AVATAR_COLOR} identity="github" />);
    expect(maya).not.toEqual(github);
  });

  it("parses shape indexes from encoded color values", () => {
    const parsed = parseBotAvatar(`${DEFAULT_BOT_AVATAR_COLOR}::shape_3`);
    expect(parsed.color).toBe(DEFAULT_BOT_AVATAR_COLOR);
    expect(parsed.shapeIndex).toBe(3);
    expect(parsed.isImage).toBe(false);
  });

  it("normalizes malformed shape suffixes to shape 0", () => {
    expect(parseBotAvatar(`${DEFAULT_BOT_AVATAR_COLOR}::shape_-1`).shapeIndex).toBe(0);
    expect(parseBotAvatar(`${DEFAULT_BOT_AVATAR_COLOR}::shape_3junk`).shapeIndex).toBe(0);
    expect(parseBotAvatar(`${DEFAULT_BOT_AVATAR_COLOR}::shape_`).shapeIndex).toBe(0);
  });

  it("resolves explicit colors and shapes", () => {
    expect(resolvePersonaColorDef("bot", "#10B981").hex.toLowerCase()).toBe("#10b981");
    expect(resolvePersonaColorDef("bot", "#fff").hex).toBe("#fff");
    expect(resolvePersonaShape("bot", "hex")).toContain("M");
    expect(BOT_AVATAR_COLORS.length).toBeGreaterThan(0);
  });

  it("falls back to the identity palette for invalid custom hex", () => {
    expect(resolvePersonaColorDef("bot", "#zzzzzz")).toEqual(resolvePersonaColorDef("bot"));
    expect(resolvePersonaColorDef("bot", "#ggg")).toEqual(resolvePersonaColorDef("bot"));
  });

  it("renders uploaded images without the geometric svg", () => {
    const html = renderToString(
      <BotAvatar color="data:image/png;base64,abc" identity="maya" size={32} />,
    );
    expect(html).toContain("<img");
    expect(html).not.toContain("<path");
    expect(html).not.toContain("bot-character-eyes");
  });

  it("keeps a working photo ring outside the clipped image and uses the status token", () => {
    const html = renderToString(
      <BotAvatar
        color="data:image/png;base64,abc"
        identity="maya"
        size={32}
        status="running"
        animated
      />,
    );
    expect(html).toContain('class="rakazo-bot-avatar relative shrink-0 select-none"');
    expect(html).toContain("rakazo-bot-avatar-picture");
    expect(html).toContain("rakazo-bot-avatar-ring-working");
    expect(html).toContain("stroke-status-working");
    expect(html).toContain('data-working="true"');
    expect(html.indexOf("rakazo-bot-avatar-picture")).toBeLessThan(
      html.indexOf("rakazo-bot-avatar-ring"),
    );
  });

  it("keeps idle photo avatars ring-free", () => {
    const html = renderToString(
      <BotAvatar color="data:image/png;base64,abc" identity="maya" size={32} status="idle" />,
    );
    expect(html).toContain("rakazo-bot-avatar-picture");
    expect(html).toContain('data-working="false"');
    expect(html).not.toContain("rakazo-bot-avatar-ring");
  });

  it("does not treat arbitrary http(s) color values as remote images", () => {
    const parsed = parseBotAvatar("https://evil.example/track.png");
    expect(parsed.isImage).toBe(false);
    expect(parsed.imageUrl).toBeUndefined();
    const html = renderToString(
      <BotAvatar color="https://evil.example/track.png" identity="maya" size={32} />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
  });

  it("shows a working studio shape as a busy character instead of a glowing ring", () => {
    const html = renderToString(
      <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={32} status="running" animated />,
    );
    expect(html).toContain('data-motion="busy"');
    expect(html).not.toContain("rakazo-bot-avatar-ring");
    expect(html).not.toContain("drop-shadow");
  });

  it("folds into Grok's morph figures for searching, writing, creating, messaging and waiting", () => {
    for (const motion of ["searching", "writing", "creating", "messaging", "waiting"] as const) {
      const html = renderToString(
        <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={32} motion={motion} />,
      );
      expect(html, motion).toContain(`data-motion="${motion}"`);
      expect(html, motion).toContain("rakazo-character-glyph");
      expect(html, motion).toContain("<animate");
    }
    const idle = renderToString(<BotAvatar color="#8B5CF6::shape_0" identity="maya" size={32} />);
    expect(idle).not.toContain("rakazo-character-glyph");
  });

  it("looks blocked while its run waits on the user", () => {
    for (const status of ["waiting_input", "waiting_takeover"]) {
      const html = renderToString(
        <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={32} status={status} animated />,
      );
      expect(html).toContain('data-motion="blocked"');
      expect(html).toContain('data-face="confused"');
    }
  });

  it("stays still unless animated, as Grok's header pill and panel avatars do", () => {
    const live = new Map([["maya", "thinking" as const]]);
    const html = renderToString(
      <BotMotionProvider value={live}>
        <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={32} status="running" />
        <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={32} status="waiting_input" />
      </BotMotionProvider>,
    );
    expect([...html.matchAll(/data-motion="(\w+)"/g)].map((m) => m[1])).toEqual(["idle", "idle"]);
    expect(html).toContain('data-working="false"');
  });

  it("idles with Grok's loop only when lively, and lets live faces win", () => {
    const live = new Map([["maya", "thinking" as const]]);
    const faces = renderToString(
      <BotMotionProvider value={live}>
        <BotAvatar color="#8B5CF6::shape_0" identity="otto" size={32} animated lively />
        <BotAvatar color="#8B5CF6::shape_0" identity="otto" size={32} animated />
        <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={32} animated lively />
      </BotMotionProvider>,
    );
    expect([...faces.matchAll(/data-motion="([\w-]+)"/g)].map((m) => m[1])).toEqual([
      "idle-loop",
      "idle",
      "thinking",
    ]);
  });

  it("shows the in-call face the call sets, over live and working faces", () => {
    const live = new Map([["maya", "busy" as const]]);
    const faces = (["listening", "thinking", "speaking", "idle"] as const).map(
      (call) =>
        renderToString(
          <BotMotionProvider value={live}>
            <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={32} animated call={call} />
          </BotMotionProvider>,
        ).match(/data-motion="([\w-]+)"/)?.[1],
    );
    expect(faces).toEqual(["listening", "thinking", "speaking", "idle-loop"]);
  });

  it("takes the live motion of its bot, and an explicit motion over it", () => {
    const live = new Map([["maya", "thinking" as const]]);
    const html = renderToString(
      <BotMotionProvider value={live}>
        <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={32} status="running" animated />
        <BotAvatar color="#8B5CF6" identity="maya" size={32} animated />
        <BotAvatar color="#8B5CF6" identity="maya" size={32} motion="done" />
        <BotAvatar color="#8B5CF6" identity="otto" size={32} animated />
      </BotMotionProvider>,
    );
    expect([...html.matchAll(/data-motion="(\w+)"/g)].map((m) => m[1])).toEqual([
      "thinking",
      "thinking",
      "done",
      "idle",
    ]);
    expect(html).toContain("rakazo-character-dots");
    expect(html).toContain('data-face="happy"');
  });

  it("restores a plain color that renders the animated robot instead of a pinned shape", () => {
    expect(defaultBotAvatarValue(`${DEFAULT_BOT_AVATAR_COLOR}::shape_3`)).toBe(
      DEFAULT_BOT_AVATAR_COLOR,
    );
    expect(defaultBotAvatarValue("#EAB308::shape_1")).toBe("#EAB308");
    expect(defaultBotAvatarValue("#abc::shape_2")).toBe("#abc");
    expect(defaultBotAvatarValue("#fff")).toBe("#fff");
    expect(defaultBotAvatarValue("data:image/png;base64,abc")).toBe(DEFAULT_BOT_AVATAR_COLOR);
    expect(defaultBotAvatarValue("#zzzzzz::shape_1")).toBe(DEFAULT_BOT_AVATAR_COLOR);
    expect(defaultBotAvatarValue("")).toBe(DEFAULT_BOT_AVATAR_COLOR);

    const restored = renderToString(
      <BotAvatar
        color={defaultBotAvatarValue(`${DEFAULT_BOT_AVATAR_COLOR}::shape_4`)}
        identity="maya"
        variant="robot"
      />,
    );
    const shaped = renderToString(
      <BotAvatar color={`${DEFAULT_BOT_AVATAR_COLOR}::shape_4`} identity="maya" />,
    );
    expect(restored).toContain("rakazo-bot-avatar-visor");
    expect(restored).not.toContain("bot-character-eyes");
    expect(shaped).toContain("bot-character-eyes");
    expect(shaped).not.toContain("rakazo-bot-avatar-visor");
  });

  it("exposes shape picker name and pressed state", () => {
    const html = renderToString(
      <BotShapePreview shapeIndex={0} color="#8B5CF6" selected onClick={() => undefined} />,
    );
    expect(html).toContain('aria-label="hex"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("focus-visible:ring-2");
    // Grok's selection ring: an outline 3px off the shape, drawn under it.
    expect(html).toContain("stroke-input-focus");
    expect(html.indexOf("stroke-input-focus")).toBeLessThan(html.indexOf("mask="));
    const idle = renderToString(<BotShapePreview shapeIndex={0} color="#8B5CF6" />);
    expect(idle).not.toContain("stroke-input-focus");
  });

  it("draws flat, shadowless bodies with eyes cut out of them, as in Grok", () => {
    for (const color of ["#915BFC::shape_3", "#915BFC"]) {
      const html = renderToString(<BotAvatar color={color} identity="maya" size={40} />);
      const mask = html.match(/<mask id="([^"]+)"/)?.[1];
      expect(mask).toBeTruthy();
      expect(html).toContain(`mask="url(#${mask})"`);
      expect(html).toContain('fill="black"');
      expect(html).not.toContain('linearGradient id="bot-ink');
      expect(html).not.toContain("drop-shadow(0 2px");
      expect(html).toContain("fill:#915BFC");
    }
  });

  it("gives each avatar its own eye mask", () => {
    const html = renderToString(
      <div>
        <BotAvatar color="#915BFC" identity="a" />
        <BotAvatar color="#915BFC" identity="b" />
      </div>,
    );
    const masks = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
    expect(masks).toHaveLength(2);
    expect(new Set(masks).size).toBe(2);
  });

  it("follows the theme for Grok's white and grey swatches only", () => {
    expect(botAvatarFill("#FFFFFF")).toBe("var(--avatar-white)");
    expect(botAvatarFill("#fff")).toBe("var(--avatar-white)");
    expect(botAvatarFill("#777777")).toBe("var(--avatar-grey)");
    expect(botAvatarFill("#915BFC")).toBe("#915BFC");
  });

  it("offers Grok's eleven swatches", () => {
    expect(BOT_AVATAR_COLORS).toEqual([
      "#FFFFFF",
      "#A16C39",
      "#FC2D3E",
      "#FA6710",
      "#F79411",
      "#13C370",
      "#15B8A4",
      "#1784FC",
      "#915BFC",
      "#FB3499",
      "#777777",
    ]);
  });

  it("renders distinct robot and organic previews for the same identity", () => {
    const robot = renderToString(
      <BotAvatar
        color={DEFAULT_BOT_AVATAR_COLOR}
        identity="avatar-style-preview"
        variant="robot"
      />,
    );
    const organic = renderToString(
      <BotAvatar
        color={DEFAULT_BOT_AVATAR_COLOR}
        identity="avatar-style-preview"
        variant="organic"
      />,
    );
    expect(robot).not.toEqual(organic);
    expect(robot).toContain("rakazo-bot-avatar-eyes");
    expect(robot).not.toContain("bot-character-eyes");
    expect(organic).toContain("rakazo-organic-avatar");
    expect(organic).not.toContain("rakazo-bot-avatar-eyes");
  });

  it("defaults to organic without a provider", () => {
    const html = renderToString(<BotAvatar color={DEFAULT_BOT_AVATAR_COLOR} identity="maya" />);
    expect(html).toContain("rakazo-organic-avatar");
  });

  it("uses the preferred avatar style when variant is omitted", () => {
    const html = renderToString(
      <AvatarStyleProvider value="robot">
        <BotAvatar color={DEFAULT_BOT_AVATAR_COLOR} identity="maya" />
      </AvatarStyleProvider>,
    );
    expect(html).toContain("rakazo-bot-avatar-visor");
    expect(html).not.toContain("bot-character-eyes");
  });

  it("keeps uploaded images when the organic style is preferred", () => {
    const html = renderToString(
      <BotAvatar color="data:image/png;base64,abc" identity="maya" variant="organic" />,
    );
    expect(html).toContain("<img");
    expect(html).not.toContain("rakazo-organic-avatar");
  });

  it("keeps an encoded studio shape when the organic style is preferred", () => {
    const html = renderToString(
      <BotAvatar
        color={`${DEFAULT_BOT_AVATAR_COLOR}::shape_3`}
        identity="maya"
        variant="organic"
      />,
    );
    expect(html).toContain("bot-character-eyes");
    expect(html).not.toContain("rakazo-organic-avatar");
  });

  it("fills the organic body with the resolved palette hex when the custom color is invalid", () => {
    const fallback = resolvePersonaColorDef("maya", "#zzzzzz");
    const html = renderToString(<BotAvatar color="#zzzzzz" identity="maya" variant="organic" />);
    expect(html).toContain("rakazo-organic-avatar");
    expect(html).toContain(`fill:${fallback.hex}`);
    expect(html).not.toContain("#zzzzzz");
  });
});

function styleValue(style: string, property: string): string {
  const match = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`missing ${property} in ${style}`);
  return value;
}

function px(style: string, property: string): number {
  const value = styleValue(style, property);
  const match = value.match(/^(\d+)px$/);
  if (!match?.[1]) throw new Error(`${property} is not px: ${value}`);
  return Number(match[1]);
}

function robotFaceFromHtml(html: string) {
  const visor = html.match(/class="[^"]*rakazo-bot-avatar-visor[^"]*" style="([^"]*)"/);
  const visorStyle = visor?.[1];
  if (!visorStyle) throw new Error("missing visor");
  const border = styleValue(visorStyle, "border").match(/^(\d+)px/);
  const borderPx = Number(border?.[1] ?? "0");
  const eyeRows = [...html.matchAll(/class="[^"]*rakazo-bot-avatar-eyes[^"]*" style="([^"]*)"/g)];
  const eyeSpans = [...html.matchAll(/<span class="block" style="([^"]*background-color:[^"]*)"/g)];
  if (eyeRows.length === 0 || eyeSpans.length === 0) throw new Error("missing eyes");
  const gaps = eyeRows.map((row) => px(row[1] ?? "", "gap"));
  const widths = eyeSpans.map((span) => px(span[1] ?? "", "width"));
  const heights = eyeSpans.map((span) => px(span[1] ?? "", "height"));
  const eyeGap = gaps[0];
  const eyeW = widths[0];
  const eyeH = heights[0];
  if (eyeGap === undefined || eyeW === undefined || eyeH === undefined) {
    throw new Error("missing eye metrics");
  }
  expect(new Set(gaps)).toEqual(new Set([eyeGap]));
  expect(new Set(widths)).toEqual(new Set([eyeW]));
  expect(new Set(heights)).toEqual(new Set([eyeH]));
  return {
    visorW: px(visorStyle, "width"),
    visorH: px(visorStyle, "height"),
    innerW: px(visorStyle, "width") - borderPx * 2,
    innerH: px(visorStyle, "height") - borderPx * 2,
    eyeW,
    eyeH,
    eyeGap,
  };
}

describe("botAvatarOutline", () => {
  const drawnPaths = (html: string) =>
    [...html.matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1]);

  it("matches the organic blob BotAvatar draws, which holds still at rest", () => {
    const outline = botAvatarOutline("#14B8A6", "otto", "organic");
    const html = renderToString(<BotAvatar color="#14B8A6" identity="otto" variant="organic" />);
    expect(outline?.viewBox).toBe("-60 -60 120 120");
    expect(outline?.paths).toHaveLength(1);
    expect(drawnPaths(html)).toContain(outline?.paths[0]);
    expect(html).not.toContain("<animate");
  });

  it("matches a picked shape in either avatar style", () => {
    const color = "#F97316::shape_2";
    for (const variant of ["organic", "robot"] as const) {
      const outline = botAvatarOutline(color, "felix", variant);
      const html = renderToString(<BotAvatar color={color} identity="felix" variant={variant} />);
      expect(outline?.paths).toHaveLength(1);
      expect(drawnPaths(html)).toContain(outline?.paths[0]);
    }
  });

  it("leaves round avatars (photos and robots) to a circle", () => {
    expect(botAvatarOutline("data:image/png;base64,AAAA", "otto", "organic")).toBeUndefined();
    expect(botAvatarOutline("#14B8A6", "otto", "robot")).toBeUndefined();
  });
});
