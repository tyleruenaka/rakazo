import { spawnSync } from "node:child_process";
import path from "node:path";
import { browserProfilePathForScreen } from "@rakazo/core/node/desktop-runtime";
import { describe, expect, it } from "vitest";
import { containerActionStep } from "./supervisor-logic.js";

const profile = browserProfilePathForScreen("test-bot");
const display = ":7";
const controlPath = path.resolve(import.meta.dirname, "../../computer/control.py");

function check(argv: string[]) {
  const probe = spawnSync(
    "python3",
    [
      "-c",
      [
        "import importlib.util, json, sys",
        "from unittest.mock import patch",
        "spec = importlib.util.spec_from_file_location('control_probe', sys.argv[1])",
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "argv = json.loads(sys.argv[2])",
        "allowed = module.allowed_control_argv(argv, sys.argv[3])",
        "long_lived = module.is_long_lived_control(argv) if allowed else False",
        "if long_lived:",
        "  with patch.object(module.subprocess, 'Popen') as popen:",
        "    popen.return_value.wait.return_value = 0",
        "    module.run_control_argv(argv, sys.argv[3])",
        "    assert popen.call_args.args[0] == argv, 'profile must survive execution'",
        "    assert popen.call_args.kwargs['env']['DISPLAY'] == sys.argv[3]",
        "print(json.dumps({'allowed': allowed, 'longLived': long_lived}))",
      ].join("\n"),
      controlPath,
      JSON.stringify(argv),
      display,
    ],
    { encoding: "utf8" },
  );
  expect(probe.status, probe.stderr).toBe(0);
  return JSON.parse(probe.stdout);
}

describe.each([undefined, profile])(
  "supervisor/controller argv contract (profile=%s)",
  (browserProfile) => {
    it.each([
      { kind: "open" as const, path: "https://example.com" },
      { kind: "open" as const, path: "screenshots/image #1.png" },
      { kind: "launch" as const, application: "chromium", uri: "https://example.com" },
      { kind: "launch" as const, application: "chromium" },
      { kind: "launch" as const, application: "xterm" },
      { kind: "focus" as const, application: "chromium", uri: "https://example.com" },
      { kind: "focus" as const, application: "chromium" },
      { kind: "focus" as const, application: "xterm" },
    ])("accepts generated $kind argv and does not treat focus as a long-lived app", (action) => {
      const step = containerActionStep(action, display, browserProfile);
      if (!("argv" in step)) throw new Error("expected command");
      if (
        browserProfile &&
        (action.kind === "open" ||
          ((action.kind === "launch" || action.kind === "focus") &&
            action.application === "chromium"))
      ) {
        expect(step.argv[2]).toBe(`RAKAZO_BROWSER_PROFILE=${browserProfile}`);
      }
      expect(check(step.argv)).toEqual({
        allowed: true,
        longLived: action.kind !== "focus",
      });
    });

    it("accepts generated keyboard input without treating it as a long-lived process", () => {
      const step = containerActionStep({ kind: "key", key: "Enter" }, display, browserProfile);
      if (!("argv" in step)) throw new Error("expected command");
      expect(check(step.argv)).toEqual({ allowed: true, longLived: false });
    });
  },
);

describe("controller argv restrictions", () => {
  it.each([
    ["env", `DISPLAY=${display}`, `RAKAZO_BROWSER_PROFILE=${profile}`],
    ["env", `DISPLAY=${display}`, "RAKAZO_BROWSER_PROFILE=", "rakazo-browser"],
    ["env", `DISPLAY=${display}`, `RAKAZO_BROWSER_PROFILE=${profile}a`, "rakazo-browser"],
    [
      "env",
      `DISPLAY=${display}`,
      `RAKAZO_BROWSER_PROFILE=${profile.toUpperCase()}`,
      "rakazo-browser",
    ],
    ["env", `DISPLAY=${display}`, `RAKAZO_BROWSER_PROFILE=${profile}`, "xterm"],
    [
      "env",
      `DISPLAY=${display}`,
      `RAKAZO_BROWSER_PROFILE=${profile}`,
      "/usr/bin/xdg-open",
      "https://example.com",
    ],
    ["env", `DISPLAY=${display}`, `RAKAZO_BROWSER_PROFILE=${profile}`, "xdg-open"],
    [
      "env",
      `DISPLAY=${display}`,
      `RAKAZO_BROWSER_PROFILE=${profile}`,
      "rakazo-browser",
      "one",
      "two",
    ],
    ["env", "DISPLAY=:8", `RAKAZO_BROWSER_PROFILE=${profile}`, "rakazo-browser"],
    ["env", "DISPLAY=:8", "xdg-open", "https://example.com"],
    ["env", `DISPLAY=${display}`, "rakazo-focus-or-launch"],
    ["env", `DISPLAY=${display}`, "rakazo-focus-or-launch", "sh"],
    ["env", `DISPLAY=${display}`, "rakazo-focus-or-launch", "rakazo-focus-or-launch"],
    ["env", `DISPLAY=${display}`, "rakazo-focus-or-launch", "/usr/bin/xterm"],
    ["env", `DISPLAY=${display}`, "rakazo-focus-or-launch", "xterm", "one", "two"],
    [
      "env",
      `DISPLAY=${display}`,
      `RAKAZO_BROWSER_PROFILE=${profile}`,
      "rakazo-focus-or-launch",
      "xterm",
    ],
    ["env", "DISPLAY=:8", "rakazo-focus-or-launch", "xterm"],
    ["env", `DISPLAY=${display}`, "LD_PRELOAD=/tmp/unsafe", "xdg-open", "https://example.com"],
    ["env", `DISPLAY=${display}`, "RAKAZO_BROWSER_PROFILE=/tmp/unsafe", "rakazo-browser"],
    ["env", `DISPLAY=${display}`, `RAKAZO_BROWSER_PROFILE=${profile}/../other`, "rakazo-browser"],
    ["env", `DISPLAY=${display}`, `RAKAZO_BROWSER_PROFILE=${profile}`, "sh", "-c", "true"],
    ["env", `DISPLAY=${display}`, `RAKAZO_BROWSER_PROFILE=${profile}`, "xdotool", "key", "Return"],
    [
      "env",
      `DISPLAY=${display}`,
      `RAKAZO_BROWSER_PROFILE=${profile}`,
      `RAKAZO_BROWSER_PROFILE=${profile}`,
      "rakazo-browser",
    ],
  ])("rejects malformed or unauthorized argv %j", (...argv) => {
    expect(check(argv).allowed).toBe(false);
  });
});

describe("controller batches across a screen handover", () => {
  function runBatch(steps: unknown[], handOverDuringWait: boolean) {
    const probe = spawnSync(
      "python3",
      [
        "-c",
        [
          "import importlib.util, json, os, sys, tempfile, threading, urllib.error, urllib.request",
          "spec = importlib.util.spec_from_file_location('control_probe', sys.argv[1])",
          "module = importlib.util.module_from_spec(spec)",
          "spec.loader.exec_module(module)",
          "generation = os.path.join(tempfile.mkdtemp(), 'input-generation-{}')",
          "module.INPUT_GENERATION = generation",
          "module.TOKEN = 'probe-token'",
          "module.native_capture = lambda display: None",
          "ran = []",
          "module.run_control_argv = lambda argv, display, generation=None: ran.append(argv)",
          "real_sleep = module.time.sleep",
          "def sleep(seconds):",
          "  if sys.argv[3] == 'handover':",
          "    with open(generation.format('7'), 'w') as handle: handle.write('next-owner')",
          "  real_sleep(0)",
          "module.time.sleep = sleep",
          "server = module.ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)",
          "threading.Thread(target=server.serve_forever, daemon=True).start()",
          "body = json.dumps({'display': ':7', 'steps': json.loads(sys.argv[2]), 'observe': False}).encode()",
          "request = urllib.request.Request(f'http://127.0.0.1:{server.server_port}/v1/desktop', data=body, headers={'Authorization': 'Bearer probe-token'})",
          "try:",
          "  response = urllib.request.urlopen(request); status, payload = response.status, json.load(response)",
          "except urllib.error.HTTPError as error:",
          "  status, payload = error.code, json.load(error)",
          "print(json.dumps({'status': status, 'payload': payload, 'ran': len(ran)}))",
        ].join("\n"),
        controlPath,
        JSON.stringify(steps),
        handOverDuringWait ? "handover" : "same-owner",
      ],
      { encoding: "utf8" },
    );
    expect(probe.status, probe.stderr).toBe(0);
    return JSON.parse(probe.stdout) as { status: number; payload: unknown; ran: number };
  }

  const typing = [
    containerActionStep({ kind: "wait", ms: 200 }, display),
    containerActionStep({ kind: "clipboard", text: "secret" }, display),
  ];

  it("stops before the next step once the screen changed hands", () => {
    const result = runBatch(typing, true);
    expect(result.ran).toBe(0);
    expect(result.status).toBe(500);
    expect(result.payload).toEqual({ error: "computer screen changed hands" });
  });

  it("runs every step while the screen stays with its owner", () => {
    expect(runBatch(typing, false)).toMatchObject({ status: 200, ran: 1 });
  });
});
