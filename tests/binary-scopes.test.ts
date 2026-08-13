import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

/**
 * End-to-end scope smoke tests against the real built binary.
 *
 * tests/binary.test.ts already proves the binary starts and speaks MCP from
 * inside this git repo. These tests prove the two behaviors that only show
 * up when the process runs from *outside* a git repo — which unit tests
 * that import source modules directly can't exercise, since they never
 * spawn a fresh process with its own cwd/env.
 */

const BIN = resolve(__dirname, "../dist/stdio.cjs");

function rpc(id: number, method: string, params?: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) + "\n";
}

interface Req {
  id: number;
  method: string;
  params?: unknown;
}

/** Drive the built binary over stdio with a custom cwd/env, collecting responses until the last request's id arrives. */
async function callBinary(requests: Req[], options: { cwd: string; env: NodeJS.ProcessEnv }, timeoutMs = 15_000) {
  const child = spawn(process.execPath, [BIN], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
  });
  const stderr: string[] = [];
  child.stderr.on("data", (d) => stderr.push(String(d)));

  // Tool calls can complete out of order, so wait for every requested id —
  // not just the last one in the array — before resolving.
  const wantIds = requests.map((r) => r.id);
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
      if (wantIds.every((id) => messages.some((m) => m.id === id))) {
        clearTimeout(timer);
        res(messages);
      }
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      rej(e);
    });
    child.on("exit", (code) => {
      if (!wantIds.every((id) => messages.some((m) => m.id === id))) {
        clearTimeout(timer);
        rej(new Error(`exited early with code ${code}. stderr:\n${stderr.join("")}`));
      }
    });
  });

  child.stdin.write(
    rpc(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "scope-e2e-test", version: "0" },
    }),
  );
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  for (const req of requests) {
    child.stdin.write(rpc(req.id, req.method, req.params));
  }

  try {
    return await done;
  } finally {
    child.kill();
  }
}

describe("built binary — scope behavior outside a git repo", () => {
  const testDir = join(tmpdir(), "anchor-mcp-test-binary-scopes");
  const nonGitCwd = join(testDir, "not-a-repo");
  const userDir = join(testDir, "user-home");

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(nonGitCwd, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it(
    "starts, lists tools, serves user-scope memory, and returns a clear error from a project-scope tool",
    async () => {
      const messages = await callBinary(
        [
          { id: 2, method: "tools/list" },
          {
            id: 3,
            method: "tools/call",
            params: { name: "memory_manager", arguments: { action: "add", content: "works anywhere" } },
          },
          {
            id: 4,
            method: "tools/call",
            params: { name: "task_manager", arguments: { action: "get_active" } },
          },
        ],
        { cwd: nonGitCwd, env: { ANCHOR_USER_DIR: userDir } },
      );

      const init = messages.find((m) => m.id === 1);
      expect(init, "no response to initialize").toBeDefined();
      expect(init.error, `initialize returned an error: ${JSON.stringify(init.error)}`).toBeUndefined();

      const list = messages.find((m) => m.id === 2);
      expect(list?.result?.tools?.length, "tools/list should still advertise all tools").toBeGreaterThan(0);

      const memoryAdd = messages.find((m) => m.id === 3);
      expect(memoryAdd?.error, `user-scope memory add errored: ${JSON.stringify(memoryAdd?.error)}`).toBeUndefined();
      expect(memoryAdd?.result?.content?.[0]?.text).toContain("works anywhere");

      const taskGet = messages.find((m) => m.id === 4);
      expect(taskGet?.error, "expected a normal tool result, not a protocol-level error").toBeUndefined();
      expect(taskGet?.result?.content?.[0]?.text).toContain("not inside a git repository");
    },
    20_000,
  );

  it(
    "rejects limit: 0 and negative limit at the schema level (memory_manager search)",
    async () => {
      const messages = await callBinary(
        [
          {
            id: 2,
            method: "tools/call",
            params: { name: "memory_manager", arguments: { action: "search", query: "x", limit: 0 } },
          },
        ],
        { cwd: nonGitCwd, env: { ANCHOR_USER_DIR: join(userDir, "limit-zero") } },
      );
      const res = messages.find((m) => m.id === 2);
      // zod validation failures surface as a tool result with isError: true
      // (not a top-level JSON-RPC error) — the handler itself is never reached.
      expect(res?.result?.isError, `expected a validation error, got: ${JSON.stringify(res)}`).toBe(true);
      expect(res?.result?.content?.[0]?.text).toContain("greater than 0");

      const messagesNegative = await callBinary(
        [
          {
            id: 2,
            method: "tools/call",
            params: { name: "memory_manager", arguments: { action: "search", query: "x", limit: -1 } },
          },
        ],
        { cwd: nonGitCwd, env: { ANCHOR_USER_DIR: join(userDir, "limit-negative") } },
      );
      const resNegative = messagesNegative.find((m) => m.id === 2);
      expect(
        resNegative?.result?.isError,
        `expected a validation error, got: ${JSON.stringify(resNegative)}`,
      ).toBe(true);
    },
    20_000,
  );
});
