import { describe, it, expect } from "vitest"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { resolveUserAnchorDir } from "../src/worktree"

describe("resolveUserAnchorDir", () => {
  it("defaults to ~/.anchor", () => {
    const original = process.env.ANCHOR_USER_DIR
    delete process.env.ANCHOR_USER_DIR
    try {
      expect(resolveUserAnchorDir()).toBe(join(homedir(), ".anchor"))
    } finally {
      if (original !== undefined) process.env.ANCHOR_USER_DIR = original
    }
  })

  it("respects ANCHOR_USER_DIR override", () => {
    const original = process.env.ANCHOR_USER_DIR
    process.env.ANCHOR_USER_DIR = "/tmp/anchor-mcp-custom-user-dir"
    try {
      expect(resolveUserAnchorDir()).toBe(resolve("/tmp/anchor-mcp-custom-user-dir"))
    } finally {
      if (original === undefined) delete process.env.ANCHOR_USER_DIR
      else process.env.ANCHOR_USER_DIR = original
    }
  })
})
