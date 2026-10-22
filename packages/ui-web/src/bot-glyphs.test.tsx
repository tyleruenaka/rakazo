import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { GlyphLayer } from "./bot-glyphs.js";

it.each(["searching", "messaging", "waiting", "creating", "writing"])(
  "draws the %s figure with valid SVG props",
  (motion) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const markup = renderToStaticMarkup(
      <svg>
        <GlyphLayer motion={motion} center={0} unit={120} size={28} fill="#000" />
      </svg>,
    );
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
    if (motion === "searching") expect(markup).toContain('attributeName="stroke-width"');
  },
);
