import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkingStatusLine } from "./WorkingStatusLine";

describe("WorkingStatusLine", () => {
  it("shows the working bot's live avatar and a phrase for its activity", () => {
    const html = renderToString(
      <WorkingStatusLine
        running
        bots={[{ botId: "research", color: "#14B8A6", status: "running" }]}
        kind="search"
        label="Research is working"
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Research is working");
    expect(html).toContain("Looking it up");
    expect(html).toContain('data-motion="busy"');
    expect(html).not.toContain("·");
  });

  it("names the bots when several are working", () => {
    const html = renderToString(
      <WorkingStatusLine
        running
        bots={[
          { botId: "research", color: "#14B8A6", status: "running" },
          { botId: "ezra", color: "#8B5CF6", status: "running" },
        ]}
        kind="working"
        label="Bots are working"
      />,
    );
    expect(html.match(/Bots are working/g)).toHaveLength(2);
  });

  it("adds the time on the step once it passes a minute", () => {
    const html = renderToString(
      <WorkingStatusLine
        running
        bots={[{ botId: "research", color: "#14B8A6", status: "running" }]}
        kind="thinking"
        since={Date.now() - 3 * 60_000}
        label="Research is working"
      />,
    );
    expect(html).toContain("· <!-- -->3m");
  });

  it("renders nothing when no bot is working", () => {
    const html = renderToString(
      <WorkingStatusLine running={false} bots={[]} kind="working" label="" />,
    );
    expect(html).toBe("");
  });
});
