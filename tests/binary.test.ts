import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Packaging smoke test.
 *
 * The other suites import source modules directly, so they pass even when the
 * bundled binary is unrunnable — which is exactly how a double shebang shipped
 * to npm unnoticed. This test executes dist/stdio.cjs the way a user's agent
 * does: as a subprocess speaking newline-delimited JSON-RPC over stdio.
 */

const BIN = resolve(__dirname, "../dist/stdio.cjs");
const EXPECTED_TOOLS = [
  "task_manager",
  "plan_manager",
  "notepad_manager",
  "memory_manager",
  "rules_manager",
  "promote_learning",
];

function rpc(id: number, method: string, params?: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) + "\n";
}

/** Drive the built binary over stdio and collect responses until `wantId` arrives. */
async function callBinary(wantId: number, timeoutMs = 15_000) {
  const child = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "pipe"] });
  const stderr: string[] = [];
  child.stderr.on("data", (d) => stderr.push(String(d)));

  const messages: any[] = [];
  const done = new Promise<any[]>((res, rej) => {
    const timer = setTimeout(
      () => rej(new Error(`timed out after ${timeoutMs}ms. stderr:\n${stderr.join("")}`)),
      timeoutMs,
    );
    let buf = "";
    child.stdout.on("data", (chunk) => {
      buf += String(chunk);
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          messages.push(JSON.parse(line));
        } catch {
          /* ignore non-JSON banner output */
        }
      }
      if (messages.some((m) => m.id === wantId)) {
        clearTimeout(timer);
        res(messages);
      }
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      rej(e);
    });
    child.on("exit", (code) => {
      if (!messages.some((m) => m.id === wantId)) {
        clearTimeout(timer);
        rej(new Error(`exited early with code ${code}. stderr:\n${stderr.join("")}`));
      }
    });
  });

  child.stdin.write(
    rpc(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "binary-smoke-test", version: "0" },
    }),
  );
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  child.stdin.write(rpc(2, "tools/list"));

  try {
    return await done;
  } finally {
    child.kill();
  }
}

describe("built binary (dist/stdio.cjs)", () => {
  it("exists — run `npm run build` first", () => {
    expect(existsSync(BIN), `missing ${BIN}`).toBe(true);
  });

  it("starts and completes an MCP handshake", async () => {
    const messages = await callBinary(2);
    const init = messages.find((m) => m.id === 1);
    expect(init, "no response to initialize").toBeDefined();
    expect(init.error, `initialize returned an error: ${JSON.stringify(init.error)}`).toBeUndefined();
    expect(init.result.serverInfo.name).toBe("anchor-mcp");
    expect(init.result.capabilities.tools).toBeDefined();
  }, 20_000);

  it("advertises all six grouped tools", async () => {
    const messages = await callBinary(2);
    const list = messages.find((m) => m.id === 2);
    expect(list, "no response to tools/list").toBeDefined();
    const names = list.result.tools.map((t: { name: string }) => t.name);
    for (const tool of EXPECTED_TOOLS) expect(names).toContain(tool);
    for (const tool of list.result.tools) {
      expect(tool.description, `${tool.name} has no description`).toBeTruthy();
      expect(tool.inputSchema, `${tool.name} has no input schema`).toBeDefined();
    }
  }, 20_000);
});
