import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AnchorStore } from "../src/store"

describe("AnchorStore scopes and gitignore", () => {
  const testDir = join(tmpdir(), "anchor-mcp-test-store-scopes")
  const projectDir = join(testDir, "project")
  const userDir = join(testDir, "user-home", ".anchor")

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  // ── anchorDir option (user store path shape) ────────────────────

  it("anchorDir option points directly at the given dir, no extra .anchor join", () => {
    const store = new AnchorStore("", { anchorDir: userDir })
    store.saveNotepad("topic", "content")
    expect(existsSync(join(userDir, "notepads", "topic.md"))).toBe(true)
    // Not nested under an extra .anchor/.anchor
    expect(existsSync(join(userDir, ".anchor"))).toBe(false)
  })

  // ── Self-enforcing .gitignore (project scope only) ──────────────

  it("writes .anchor/.gitignore on first project write", () => {
    const store = new AnchorStore(projectDir)
    expect(existsSync(join(projectDir, ".anchor", ".gitignore"))).toBe(false)
    store.writeState(store.readState())
    const gitignorePath = join(projectDir, ".anchor", ".gitignore")
    expect(existsSync(gitignorePath)).toBe(true)
    const content = readFileSync(gitignorePath, "utf-8")
    expect(content).toContain("state.json")
    expect(content).toContain("state.json.tmp")
  })

  it("never overwrites an existing .gitignore", () => {
    const store = new AnchorStore(projectDir)
    mkdirSync(join(projectDir, ".anchor"), { recursive: true })
    writeFileSync(join(projectDir, ".anchor", ".gitignore"), "state.json\nmemory.jsonl\n", "utf-8")
    store.writeState(store.readState())
    const content = readFileSync(join(projectDir, ".anchor", ".gitignore"), "utf-8")
    expect(content).toBe("state.json\nmemory.jsonl\n")
  })

  it("does not generate a .gitignore in the user-scope dir", () => {
    const store = new AnchorStore("", { anchorDir: userDir })
    store.saveNotepad("topic", "content")
    expect(existsSync(join(userDir, ".gitignore"))).toBe(false)
  })

  // ── User dir not created until first user-scope write ───────────

  it("does not create the user dir on read-only operations", () => {
    const store = new AnchorStore("", { anchorDir: userDir })
    expect(store.getNotepad("missing")).toBeNull()
    expect(store.listNotepads()).toEqual([])
    expect(store.readMemory()).toEqual([])
    expect(existsSync(userDir)).toBe(false)
  })

  it("creates the user dir on first user-scope write", () => {
    const store = new AnchorStore("", { anchorDir: userDir })
    expect(existsSync(userDir)).toBe(false)
    store.addMemory("first private memory")
    expect(existsSync(userDir)).toBe(true)
  })

  // ── Graceful unavailability (outside a git repo) ─────────────────

  it("throws the given unavailableReason from every public method instead of touching disk", () => {
    const reason = "anchor-mcp: not inside a git repository."
    const store = new AnchorStore(projectDir, { unavailableReason: reason })
    expect(() => store.readState()).toThrow(reason)
    expect(() => store.getActiveTask()).toThrow(reason)
    expect(() => store.listTasks()).toThrow(reason)
    expect(() => store.readMemory()).toThrow(reason)
    expect(() => store.getRules()).toThrow(reason)
    expect(() => store.listPlans()).toThrow(reason)
    expect(() => store.listNotepads()).toThrow(reason)
    // No filesystem side effects — the dir is never created.
    expect(existsSync(join(projectDir, ".anchor"))).toBe(false)
  })
})
