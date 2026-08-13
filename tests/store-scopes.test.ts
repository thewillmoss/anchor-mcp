import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, appendFileSync, symlinkSync, statSync } from "node:fs"
import { join } from "node:path"
import { tmpdir, platform } from "node:os"
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
    expect(content).toContain("state.json*")
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

  it("write methods on an unavailable store also throw and create no directory", () => {
    const reason = "anchor-mcp: not inside a git repository."
    const store = new AnchorStore(projectDir, { unavailableReason: reason })
    const dummyState = { version: 1 as const, activeTask: null, tasks: [], updatedAt: "" }
    expect(() => store.writeState(dummyState)).toThrow(reason)
    expect(() => store.addMemory("x")).toThrow(reason)
    expect(() => store.saveNotepad("t", "c")).toThrow(reason)
    expect(() => store.saveRules("r")).toThrow(reason)
    expect(() => store.savePlan("p", "c")).toThrow(reason)
    expect(existsSync(join(projectDir, ".anchor"))).toBe(false)
  })

  it("exposes availability via the `available` getter", () => {
    const available = new AnchorStore(projectDir)
    expect(available.available).toBe(true)
    const unavailable = new AnchorStore(projectDir, { unavailableReason: "nope" })
    expect(unavailable.available).toBe(false)
  })

  it("exposes the resolved anchor dir via `anchorDirPath`", () => {
    const store = new AnchorStore(projectDir)
    expect(store.anchorDirPath).toBe(join(projectDir, ".anchor"))
    const userStore = new AnchorStore("", { anchorDir: userDir })
    expect(userStore.anchorDirPath).toBe(userDir)
  })

  // ── Path traversal rejection (fix A) ─────────────────────────────

  it("rejects a traversal notepad topic and writes nothing outside notepads/", () => {
    const store = new AnchorStore(projectDir)
    expect(() => store.saveNotepad("../escaped", "content")).toThrow(/invalid topic/)
    expect(() => store.getNotepad("../escaped")).toThrow(/invalid topic/)
    // Would have landed one level up from notepads/, i.e. directly in .anchor/, had it not thrown.
    expect(existsSync(join(projectDir, ".anchor", "escaped.md"))).toBe(false)
  })

  it("rejects a traversal plan name", () => {
    const store = new AnchorStore(projectDir)
    expect(() => store.savePlan("../../escaped", "content")).toThrow(/invalid name/)
    expect(() => store.getPlan("../../escaped")).toThrow(/invalid name/)
    // Nothing escaped into the grandparent of the anchor dir.
    expect(existsSync(join(projectDir, "..", "..", "escaped"))).toBe(false)
  })

  it("rejects a traversal plan section", () => {
    const store = new AnchorStore(projectDir)
    store.savePlan("legit-plan", "content")
    expect(() => store.savePlan("legit-plan", "content", "../escaped")).toThrow(/invalid section/)
    expect(() => store.getPlanSection("legit-plan", "../escaped")).toThrow(/invalid section/)
  })

  it("rejects a traversal promote_learning planName", () => {
    const store = new AnchorStore(projectDir)
    expect(() => store.promoteLearning("../escaped")).toThrow(/invalid planName/)
  })

  // ── promote_learning ──────────────────────────────────────────────

  it("promoteLearning appends found learnings to rules", () => {
    const store = new AnchorStore(projectDir)
    store.savePlan("my-plan", "## Learnings\n\nUse atomic writes.", "learnings")
    const result = store.promoteLearning("my-plan")
    expect(result).toContain("Use atomic writes")
    expect(store.getRules()).toContain("Use atomic writes")
    expect(store.getRules()).toContain("Promoted from plan: my-plan")
  })

  it("promoteLearning returns null when no learnings.md exists", () => {
    const store = new AnchorStore(projectDir)
    store.savePlan("no-learnings-plan", "just a plan")
    expect(store.promoteLearning("no-learnings-plan")).toBeNull()
  })

  // ── Malformed JSONL (fix E) ────────────────────────────────────────

  it("skips malformed memory lines without breaking the rest", () => {
    const store = new AnchorStore(projectDir)
    store.addMemory("good entry one", ["a"])
    // A bare JSON number (valid JSON, wrong shape) and an object missing timestamp.
    appendFileSync(join(projectDir, ".anchor", "memory.jsonl"), "123\n", "utf-8")
    appendFileSync(join(projectDir, ".anchor", "memory.jsonl"), JSON.stringify({ content: "x" }) + "\n", "utf-8")
    store.addMemory("good entry two", ["b"])
    const entries = store.readMemory()
    expect(entries).toHaveLength(2)
    expect(entries[0].content).toBe("good entry one")
    expect(entries[1].content).toBe("good entry two")
    // search must not throw despite the malformed lines
    expect(store.searchMemory("good entry")).toHaveLength(2)
  })

  it("defaults missing tags to [] on read", () => {
    const store = new AnchorStore(projectDir)
    mkdirSync(join(projectDir, ".anchor"), { recursive: true })
    appendFileSync(
      join(projectDir, ".anchor", "memory.jsonl"),
      JSON.stringify({ content: "no tags field", timestamp: "2025-01-01T00:00:00.000Z" }) + "\n",
      "utf-8"
    )
    const entries = store.readMemory()
    expect(entries).toHaveLength(1)
    expect(entries[0].tags).toEqual([])
  })

  // ── Committed-.anchor clone regression (fix F) ────────────────────

  it("saveNotepad succeeds against a committed .anchor/ that has only a .gitignore", () => {
    const store = new AnchorStore(projectDir)
    mkdirSync(join(projectDir, ".anchor"), { recursive: true })
    writeFileSync(join(projectDir, ".anchor", ".gitignore"), "state.json\n", "utf-8")
    // No plans/ or notepads/ subdirectory yet — this is what a fresh clone
    // of a committed .anchor/ looks like before v0.2's mkdir-both-always fix.
    expect(() => store.saveNotepad("fresh-clone-topic", "content")).not.toThrow()
    expect(store.getNotepad("fresh-clone-topic")).toBe("content")
  })

  it("savePlan succeeds against a committed .anchor/ missing plans/", () => {
    const store = new AnchorStore(projectDir)
    mkdirSync(join(projectDir, ".anchor"), { recursive: true })
    writeFileSync(join(projectDir, ".anchor", "rules.md"), "# Rules\n", "utf-8")
    expect(() => store.savePlan("fresh-clone-plan", "content")).not.toThrow()
    expect(store.getPlan("fresh-clone-plan")).toBe("content")
  })

  // ── Identifier denylist, not allowlist (batch 2, item 2) ───────────
  // v0.1 data may have spaces or unicode in topics/plan names — both are
  // legal on disk and must keep working. Only traversal-shaped or unsafe
  // values are rejected.

  it("round-trips a notepad topic with spaces and unicode", () => {
    const store = new AnchorStore(projectDir)
    const topic = "sprint notes 会議 café"
    store.saveNotepad(topic, "content")
    expect(store.getNotepad(topic)).toBe("content")
    expect(store.listNotepads()).toContain(topic)
  })

  it("round-trips a plan name with spaces", () => {
    const store = new AnchorStore(projectDir)
    store.savePlan("v0.2 scopes and privacy", "plan content")
    expect(store.getPlan("v0.2 scopes and privacy")).toBe("plan content")
  })

  it("round-trips a plan name with an embedded '..' (not leading, not a separator)", () => {
    const store = new AnchorStore(projectDir)
    // Legitimate v0.1 naming like "v1..v2" -- a bare '..' substring cannot
    // traverse anywhere once '/' and '\\' are banned, so it is allowed.
    store.savePlan("v1..v2", "diff plan content")
    expect(store.getPlan("v1..v2")).toBe("diff plan content")
    expect(store.listPlans()).toContain("v1..v2")
  })

  it("still rejects traversal, empty, exact '.'/'..', leading-dot, and control-char identifiers", () => {
    const store = new AnchorStore(projectDir)
    expect(() => store.saveNotepad("../escaped", "c")).toThrow(/invalid topic/)
    expect(() => store.saveNotepad("a/b", "c")).toThrow(/invalid topic/)
    expect(() => store.saveNotepad("a\\b", "c")).toThrow(/invalid topic/)
    expect(() => store.saveNotepad("", "c")).toThrow(/invalid topic/)
    expect(() => store.saveNotepad(".", "c")).toThrow(/invalid topic/)
    expect(() => store.saveNotepad("..", "c")).toThrow(/invalid topic/)
    expect(() => store.saveNotepad(".hidden", "c")).toThrow(/invalid topic/)
    expect(() => store.saveNotepad("badbell", "c")).toThrow(/invalid topic/)
  })

  // ── Symlink guard (batch 2, item 3) ─────────────────────────────────

  it("refuses to read a notepad file that is a symlink", () => {
    const store = new AnchorStore(projectDir)
    store.saveNotepad("legit", "safe content")
    const outsideSecret = join(testDir, "host-secret.txt")
    writeFileSync(outsideSecret, "arbitrary host file contents", "utf-8")
    const notepadPath = join(projectDir, ".anchor", "notepads", "evil.md")
    symlinkSync(outsideSecret, notepadPath)
    expect(() => store.getNotepad("evil")).toThrow(/symlink/)
  })

  it("refuses to append memory through a symlinked memory.jsonl", () => {
    const store = new AnchorStore(projectDir)
    mkdirSync(join(projectDir, ".anchor"), { recursive: true })
    const outsideTarget = join(testDir, "host-memory.jsonl")
    writeFileSync(outsideTarget, "", "utf-8")
    symlinkSync(outsideTarget, join(projectDir, ".anchor", "memory.jsonl"))
    expect(() => store.addMemory("should not land in the host file")).toThrow(/symlink/)
    expect(readFileSync(outsideTarget, "utf-8")).toBe("")
  })

  // ── Private mode file/dir permissions (batch 2, item 4) ─────────────
  // chmod semantics aren't meaningful on Windows.
  const describeUnix = platform() === "win32" ? describe.skip : describe

  describeUnix("privateMode", () => {
    it("creates the anchor dir 0o700 and memory.jsonl 0o600", () => {
      const privateDir = join(testDir, "private-user-home", ".anchor")
      const store = new AnchorStore("", { anchorDir: privateDir, privateMode: true })
      store.addMemory("secret")
      const dirMode = statSync(privateDir).mode & 0o777
      const fileMode = statSync(join(privateDir, "memory.jsonl")).mode & 0o777
      expect(dirMode).toBe(0o700)
      expect(fileMode).toBe(0o600)
    })

    it("does not force private perms on the project store", () => {
      const store = new AnchorStore(projectDir)
      store.addMemory("not private")
      const dirMode = statSync(join(projectDir, ".anchor")).mode & 0o777
      expect(dirMode).not.toBe(0o700)
    })
  })

  // ── Corrupt state.json preservation (batch 2, item 5) ───────────────

  it("preserves a corrupt state.json as state.json.corrupt instead of destroying it", () => {
    const store = new AnchorStore(projectDir)
    mkdirSync(join(projectDir, ".anchor"), { recursive: true })
    const statePath = join(projectDir, ".anchor", "state.json")
    writeFileSync(statePath, "{ not valid json", "utf-8")

    const state = store.readState()
    expect(state.tasks).toEqual([]) // fell back to default

    const corruptPath = join(projectDir, ".anchor", "state.json.corrupt")
    expect(existsSync(corruptPath)).toBe(true)
    expect(readFileSync(corruptPath, "utf-8")).toBe("{ not valid json")

    // The next write must not destroy the preserved file.
    store.writeState(state)
    expect(existsSync(corruptPath)).toBe(true)
    expect(readFileSync(corruptPath, "utf-8")).toBe("{ not valid json")
    expect(store.readState().tasks).toEqual([])
  })
})
