import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync, mkdir } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { detectWorktreeRoot } from "../src/worktree"

describe("detectWorktreeRoot", () => {
  const testDir = join(tmpdir(), "anchor-mcp-test-worktree")

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it("detects git root from repo root", () => {
    const gitDir = join(testDir, "repo")
    mkdirSync(gitDir, { recursive: true })
    mkdirSync(join(gitDir, ".git"), { recursive: true })
    expect(detectWorktreeRoot(gitDir)).toBe(gitDir)
  })

  it("detects git root from subdirectory", () => {
    const gitDir = join(testDir, "repo")
    const subDir = join(gitDir, "src", "tools")
    mkdirSync(subDir, { recursive: true })
    mkdirSync(join(gitDir, ".git"), { recursive: true })
    expect(detectWorktreeRoot(subDir)).toBe(gitDir)
  })

  it("detects .git file (worktree) as git root", () => {
    const gitDir = join(testDir, "worktree")
    mkdirSync(gitDir, { recursive: true })
    writeFileSync(join(gitDir, ".git"), "gitdir: /some/path", "utf-8")
    expect(detectWorktreeRoot(gitDir)).toBe(gitDir)
  })

  it("throws when not in a git repository", () => {
    const noGitDir = join(testDir, "no-git")
    mkdirSync(noGitDir, { recursive: true })
    expect(() => detectWorktreeRoot(noGitDir)).toThrow("not inside a git repository")
  })

  it("respects ANCHOR_STATE_DIR env override", () => {
    const overrideDir = join(testDir, "override")
    mkdirSync(overrideDir, { recursive: true })
    const original = process.env.ANCHOR_STATE_DIR
    process.env.ANCHOR_STATE_DIR = overrideDir
    try {
      expect(detectWorktreeRoot()).toBe(overrideDir)
    } finally {
      process.env.ANCHOR_STATE_DIR = original
    }
  })
})