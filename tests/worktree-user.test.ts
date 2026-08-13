import { describe, it, expect } from "vitest"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { resolveUserAnchorDir, detectWorktreeRoot } from "../src/worktree"

function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const original = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  try {
    fn()
  } finally {
    if (original === undefined) delete process.env[name]
    else process.env[name] = original
  }
}

describe("resolveUserAnchorDir", () => {
  it("defaults to ~/.anchor", () => {
    withEnv("ANCHOR_USER_DIR", undefined, () => {
      expect(resolveUserAnchorDir()).toBe(join(homedir(), ".anchor"))
    })
  })

  it("respects ANCHOR_USER_DIR override", () => {
    withEnv("ANCHOR_USER_DIR", "/tmp/anchor-mcp-custom-user-dir", () => {
      expect(resolveUserAnchorDir()).toBe(resolve("/tmp/anchor-mcp-custom-user-dir"))
    })
  })

  // ── Tilde expansion (item B) ─────────────────────────────────────
  // MCP client configs are JSON/TOML env blocks with no shell to expand
  // "~" — anchor must do it itself, or ANCHOR_USER_DIR=~/.anchor would
  // resolve to a literal "./~" directory relative to cwd.

  it("expands a leading ~/ under ANCHOR_USER_DIR", () => {
    withEnv("ANCHOR_USER_DIR", "~/some-test-dir", () => {
      expect(resolveUserAnchorDir()).toBe(join(homedir(), "some-test-dir"))
    })
  })

  it("expands a bare ~ under ANCHOR_USER_DIR", () => {
    withEnv("ANCHOR_USER_DIR", "~", () => {
      expect(resolveUserAnchorDir()).toBe(homedir())
    })
  })
})

describe("detectWorktreeRoot tilde expansion (ANCHOR_STATE_DIR)", () => {
  it("expands a leading ~/ under ANCHOR_STATE_DIR", () => {
    withEnv("ANCHOR_STATE_DIR", "~/some-test-state-dir", () => {
      expect(detectWorktreeRoot()).toBe(join(homedir(), "some-test-state-dir"))
    })
  })
})
