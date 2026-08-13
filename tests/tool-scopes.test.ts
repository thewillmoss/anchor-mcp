import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { AnchorStore } from "../src/store"
import { registerMemoryTools } from "../src/tools/memory"
import { registerNotepadTools } from "../src/tools/notepad"

/**
 * Captures the handler a register*Tools() call would hand to a real
 * McpServer, without needing a live MCP transport.
 */
function captureHandler(register: (server: McpServer) => void) {
  let handler: (params: any) => Promise<{ content: { type: "text"; text: string }[] }>
  const fakeServer = {
    tool: (_name: string, _description: string, _schema: unknown, fn: typeof handler) => {
      handler = fn
    },
  }
  register(fakeServer as unknown as McpServer)
  return (params: any) => handler(params)
}

function text(result: { content: { type: "text"; text: string }[] }): string {
  return result.content[0]?.text ?? ""
}

describe("memory_manager / notepad_manager scope routing", () => {
  const testDir = join(tmpdir(), "anchor-mcp-test-tool-scopes")
  const projectDir = join(testDir, "project")
  const userDir = join(testDir, "user-home", ".anchor")

  let projectStore: AnchorStore
  let userStore: AnchorStore

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(projectDir, { recursive: true })
    projectStore = new AnchorStore(projectDir)
    userStore = new AnchorStore("", { anchorDir: userDir })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  // ── memory_manager ────────────────────────────────────────────

  it("memory add defaults to user scope (writes to the user store, not project)", async () => {
    const call = captureHandler((s) => registerMemoryTools(s, projectStore, userStore))
    await call({ action: "add", content: "private thing" })
    expect(existsSync(join(userDir, "memory.jsonl"))).toBe(true)
    expect(existsSync(join(projectDir, ".anchor", "memory.jsonl"))).toBe(false)
  })

  it("memory add with scope='project' writes to the project store", async () => {
    const call = captureHandler((s) => registerMemoryTools(s, projectStore, userStore))
    await call({ action: "add", content: "shared decision", scope: "project" })
    expect(existsSync(join(projectDir, ".anchor", "memory.jsonl"))).toBe(true)
    expect(existsSync(join(userDir, "memory.jsonl"))).toBe(false)
  })

  it("memory search merges both scopes and labels each entry", async () => {
    const call = captureHandler((s) => registerMemoryTools(s, projectStore, userStore))
    await call({ action: "add", content: "user secret about auth", scope: "user" })
    await call({ action: "add", content: "project note about auth", scope: "project" })
    const result = await call({ action: "search", query: "auth" })
    const parsed = JSON.parse(text(result))
    expect(parsed).toHaveLength(2)
    const scopes = parsed.map((e: any) => e.scope).sort()
    expect(scopes).toEqual(["project", "user"])
  })

  it("memory search/list apply limit after merging both scopes", async () => {
    const call = captureHandler((s) => registerMemoryTools(s, projectStore, userStore))
    for (let i = 0; i < 3; i++) {
      await call({ action: "add", content: `user entry ${i}`, scope: "user" })
      await call({ action: "add", content: `project entry ${i}`, scope: "project" })
    }
    const result = await call({ action: "list", limit: 2 })
    const parsed = JSON.parse(text(result))
    expect(parsed).toHaveLength(2)
  })

  // ── notepad_manager ───────────────────────────────────────────

  it("notepad save defaults to user scope", async () => {
    const call = captureHandler((s) => registerNotepadTools(s, projectStore, userStore))
    await call({ action: "save", topic: "arch", content: "notes" })
    expect(existsSync(join(userDir, "notepads", "arch.md"))).toBe(true)
    expect(existsSync(join(projectDir, ".anchor", "notepads", "arch.md"))).toBe(false)
  })

  it("notepad get without scope falls through from user to project", async () => {
    const call = captureHandler((s) => registerNotepadTools(s, projectStore, userStore))
    await call({ action: "save", topic: "shared", content: "project-only note", scope: "project" })
    const result = await call({ action: "get", topic: "shared" })
    expect(text(result)).toBe("project-only note")
  })

  it("notepad get prefers user scope when both exist", async () => {
    const call = captureHandler((s) => registerNotepadTools(s, projectStore, userStore))
    await call({ action: "save", topic: "shared", content: "project note", scope: "project" })
    await call({ action: "save", topic: "shared", content: "user note", scope: "user" })
    const result = await call({ action: "get", topic: "shared" })
    expect(text(result)).toBe("user note")
  })

  it("notepad list returns entries grouped by scope", async () => {
    const call = captureHandler((s) => registerNotepadTools(s, projectStore, userStore))
    await call({ action: "save", topic: "user-topic", content: "x", scope: "user" })
    await call({ action: "save", topic: "project-topic", content: "y", scope: "project" })
    const result = await call({ action: "list" })
    const parsed = JSON.parse(text(result))
    expect(parsed.user).toContain("user-topic")
    expect(parsed.project).toContain("project-topic")
  })

  // ── Graceful degradation outside a git repo ──────────────────────

  it("user-scope memory/notepad tools still work when the project store is unavailable", async () => {
    const unavailableProjectStore = new AnchorStore(projectDir, {
      unavailableReason: "anchor-mcp: not inside a git repository.",
    })
    const memoryCall = captureHandler((s) => registerMemoryTools(s, unavailableProjectStore, userStore))
    const addResult = await memoryCall({ action: "add", content: "still works" })
    expect(text(addResult)).not.toContain("Error")

    const searchResult = await memoryCall({ action: "search", query: "still" })
    const parsed = JSON.parse(text(searchResult))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].scope).toBe("user")

    const notepadCall = captureHandler((s) => registerNotepadTools(s, unavailableProjectStore, userStore))
    const saveResult = await notepadCall({ action: "save", topic: "t", content: "c" })
    expect(text(saveResult)).not.toContain("Error")
  })

  it("explicit project scope errors clearly outside a git repo", async () => {
    const unavailableProjectStore = new AnchorStore(projectDir, {
      unavailableReason: "anchor-mcp: not inside a git repository.",
    })
    const call = captureHandler((s) => registerMemoryTools(s, unavailableProjectStore, userStore))
    const result = await call({ action: "add", content: "x", scope: "project" })
    expect(text(result)).toContain("not inside a git repository")
  })

  it("notepad explicit scope=project get/save errors clearly outside a git repo", async () => {
    const unavailableProjectStore = new AnchorStore(projectDir, {
      unavailableReason: "anchor-mcp: not inside a git repository.",
    })
    const call = captureHandler((s) => registerNotepadTools(s, unavailableProjectStore, userStore))
    const saveResult = await call({ action: "save", topic: "t", content: "c", scope: "project" })
    expect(text(saveResult)).toContain("not inside a git repository")
    const getResult = await call({ action: "get", topic: "t", scope: "project" })
    expect(text(getResult)).toContain("not inside a git repository")
  })

  // ── Explicit-scope get: found vs. not-found-in-scope (item N.5) ──

  it("notepad explicit-scope get reports 'not found in X scope' distinctly per scope", async () => {
    const call = captureHandler((s) => registerNotepadTools(s, projectStore, userStore))
    await call({ action: "save", topic: "only-in-project", content: "p", scope: "project" })

    const foundInProject = await call({ action: "get", topic: "only-in-project", scope: "project" })
    expect(text(foundInProject)).toBe("p")

    const missingInUser = await call({ action: "get", topic: "only-in-project", scope: "user" })
    expect(text(missingInUser)).toContain("not found in user scope")

    const missingEntirely = await call({ action: "get", topic: "nope", scope: "project" })
    expect(text(missingEntirely)).toContain("not found in project scope")
  })

  // ── Merge recency (item N.7): limit keeps the newest N, by content ──

  it("memory search/list keep the newest entries by timestamp across scopes, not by scope order", async () => {
    const call = captureHandler((s) => registerMemoryTools(s, projectStore, userStore))
    // Interleave writes across scopes with a real time gap so timestamps
    // are strictly increasing and ordering is unambiguous.
    await call({ action: "add", content: "oldest", scope: "user" })
    await new Promise(r => setTimeout(r, 5))
    await call({ action: "add", content: "middle", scope: "project" })
    await new Promise(r => setTimeout(r, 5))
    await call({ action: "add", content: "newest", scope: "user" })

    const result = await call({ action: "list", limit: 2 })
    const parsed = JSON.parse(text(result))
    expect(parsed.map((e: any) => e.content)).toEqual(["middle", "newest"])
  })

  // ── Empty-string user notepad must not fall through (item N.10) ──

  it("notepad get: an empty-string user notepad is not treated as missing", async () => {
    const call = captureHandler((s) => registerNotepadTools(s, projectStore, userStore))
    await call({ action: "save", topic: "shared", content: "project fallback", scope: "project" })
    await call({ action: "save", topic: "shared", content: "", scope: "user" })
    const result = await call({ action: "get", topic: "shared" })
    expect(text(result)).toBe("")
  })

  // ── Same-dir collision (item C): project === user anchorDir ──────

  it("memory search/list treat identical project/user anchorDirs as user-scope only (no double-listing)", async () => {
    const sameDir = join(testDir, "shared-anchor-dir")
    const collidingProjectStore = new AnchorStore("", { anchorDir: sameDir })
    // A distinct AnchorStore instance pointed at the exact same directory —
    // mirrors $HOME being a git repo, or ANCHOR_STATE_DIR=$HOME.
    const collidingUserStore = new AnchorStore("", { anchorDir: sameDir })
    const call = captureHandler((s) => registerMemoryTools(s, collidingProjectStore, collidingUserStore))
    await call({ action: "add", content: "one entry" })
    const result = await call({ action: "list" })
    const parsed = JSON.parse(text(result))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].scope).toBe("user")
  })

  it("notepad list treats identical project/user anchorDirs as user-scope only", async () => {
    const sameDir = join(testDir, "shared-anchor-dir-notepad")
    const collidingProjectStore = new AnchorStore("", { anchorDir: sameDir })
    const collidingUserStore = new AnchorStore("", { anchorDir: sameDir })
    const call = captureHandler((s) => registerNotepadTools(s, collidingProjectStore, collidingUserStore))
    await call({ action: "save", topic: "solo", content: "x" })
    const result = await call({ action: "list" })
    const parsed = JSON.parse(text(result))
    expect(parsed.user).toEqual(["solo"])
    expect(parsed.project).toEqual([])
  })
})
