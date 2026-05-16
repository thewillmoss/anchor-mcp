import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, readFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AnchorStore } from "../src/store"

describe("AnchorStore", () => {
  const testDir = join(tmpdir(), "anchor-mcp-test-store")
  let store: AnchorStore

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(testDir, { recursive: true })
    store = new AnchorStore(testDir)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  // ── State JSON ────────────────────────────────────────────────

  it("readState returns default when no state.json exists", () => {
    const state = store.readState()
    expect(state.version).toBe(1)
    expect(state.activeTask).toBeNull()
    expect(state.tasks).toEqual([])
  })

  it("writeState + readState round-trips correctly", () => {
    const state = store.readState()
    state.tasks.push({ id: "t1", description: "test", status: "active", createdAt: "2025-01-01", updatedAt: "2025-01-01" })
    state.activeTask = "t1"
    store.writeState(state)
    const read = store.readState()
    expect(read.tasks).toHaveLength(1)
    expect(read.tasks[0].id).toBe("t1")
    expect(read.activeTask).toBe("t1")
  })

  it("writeState creates .anchor/ directory if missing", () => {
    expect(existsSync(join(testDir, ".anchor"))).toBe(false)
    store.writeState(store.readState())
    expect(existsSync(join(testDir, ".anchor"))).toBe(true)
  })

  it("writeState always sets version to 1", () => {
    const state = store.readState()
    store.writeState(state)
    const raw = JSON.parse(readFileSync(join(testDir, ".anchor", "state.json"), "utf-8"))
    expect(raw.version).toBe(1)
  })

  it("writeState sets updatedAt timestamp", () => {
    const state = store.readState()
    store.writeState(state)
    const read = store.readState()
    expect(read.updatedAt).toBeTruthy()
    expect(typeof read.updatedAt).toBe("string")
  })

  it("writeState uses atomic write (no .tmp file left behind)", () => {
    store.writeState(store.readState())
    expect(existsSync(join(testDir, ".anchor", "state.json.tmp"))).toBe(false)
    expect(existsSync(join(testDir, ".anchor", "state.json"))).toBe(true)
  })

  // ── Memory JSONL ──────────────────────────────────────────────

  it("addMemory creates memory.jsonl if missing", () => {
    expect(existsSync(join(testDir, ".anchor", "memory.jsonl"))).toBe(false)
    store.addMemory("test learning", ["test"])
    expect(existsSync(join(testDir, ".anchor", "memory.jsonl"))).toBe(true)
  })

  it("addMemory + readMemory round-trips correctly", () => {
    store.addMemory("first learning", ["tag1"])
    store.addMemory("second learning", ["tag2"])
    const entries = store.readMemory()
    expect(entries).toHaveLength(2)
    expect(entries[0].content).toBe("first learning")
    expect(entries[0].tags).toEqual(["tag1"])
    expect(entries[1].content).toBe("second learning")
  })

  it("readMemory handles corrupt lines gracefully", () => {
    store.addMemory("good entry", ["test"])
    // Manually append a corrupt line
    appendFileSync(join(testDir, ".anchor", "memory.jsonl"), "NOT JSON\n", "utf-8")
    store.addMemory("another good entry", ["test"])
    const entries = store.readMemory()
    expect(entries).toHaveLength(2) // corrupt line skipped
    expect(entries[0].content).toBe("good entry")
    expect(entries[1].content).toBe("another good entry")
  })

  // ── Task operations ───────────────────────────────────────────

  it("setActiveTask creates task and sets it active", () => {
    const task = store.setActiveTask("implement feature X")
    expect(task.description).toBe("implement feature X")
    expect(task.status).toBe("active")
    expect(store.getActiveTask()?.id).toBe(task.id)
  })

  it("completeTask marks task completed and clears active", () => {
    const task = store.setActiveTask("do something")
    const completed = store.completeTask(task.id)
    expect(completed?.status).toBe("completed")
    expect(store.getActiveTask()).toBeNull()
  })

  // ── Plans ─────────────────────────────────────────────────────

  it("savePlan + getPlan round-trips correctly", () => {
    store.savePlan("my-plan", "# My Plan\n\nStep 1: do stuff")
    const plan = store.getPlan("my-plan")
    expect(plan).toContain("My Plan")
    expect(plan).toContain("Step 1")
  })

  it("listPlans returns plan names", () => {
    store.savePlan("plan-a", "content a")
    store.savePlan("plan-b", "content b")
    const plans = store.listPlans()
    expect(plans).toContain("plan-a")
    expect(plans).toContain("plan-b")
  })

  // ── Notepads ──────────────────────────────────────────────────

  it("saveNotepad + getNotepad round-trips correctly", () => {
    store.saveNotepad("architecture", "# Architecture\n\nDetails here")
    const note = store.getNotepad("architecture")
    expect(note).toContain("Architecture")
  })

  it("listNotepads returns topic names without .md", () => {
    store.saveNotepad("perf", "perf notes")
    store.saveNotepad("security", "security notes")
    const topics = store.listNotepads()
    expect(topics).toContain("perf")
    expect(topics).toContain("security")
  })

  // ── Rules ─────────────────────────────────────────────────────

  it("saveRules + getRules round-trips correctly", () => {
    store.saveRules("# Rules\n\n1. Always write tests")
    const rules = store.getRules()
    expect(rules).toContain("Always write tests")
  })

  it("getRules returns empty string when no rules file", () => {
    expect(store.getRules()).toBe("")
  })
})
