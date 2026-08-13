/**
 * Anchor MCP — State Store
 *
 * Handles all file I/O for .anchor/ state with atomic writes.
 * Write-to-temp + rename ensures crash safety for state.json.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  appendFileSync,
  readdirSync,
} from "node:fs"
import { join } from "node:path"
import {
  ANCHOR_DIR,
  ANCHOR_GITIGNORE,
  GITIGNORE_FILE,
  STATE_FILE,
  MEMORY_FILE,
  RULES_FILE,
  PLANS_DIR,
  NOTEPADS_DIR,
  SCHEMA_VERSION,
} from "./constants.js"
import type { AnchorState, MemoryEntry, Task, TaskStatus } from "./types.js"

function nowIso(): string {
  return new Date().toISOString()
}

function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export interface AnchorStoreOptions {
  /**
   * Absolute path to the anchor directory itself, bypassing the default
   * `join(rootDir, ".anchor")`. Used for the user store, which points
   * directly at `~/.anchor` (or `ANCHOR_USER_DIR`) — joining that with
   * ".anchor" again would yield `~/.anchor/.anchor`.
   *
   * When set, this store is treated as user scope: it never generates the
   * project `.gitignore`.
   */
  anchorDir?: string
  /**
   * When set, every public method throws this message instead of touching
   * the filesystem. Used for the project store when construction happens
   * outside a git repository — the server still starts and lists tools,
   * but project-scope calls fail clearly instead of writing state.json
   * into some unrelated cwd.
   */
  unavailableReason?: string
}

export class AnchorStore {
  private readonly anchorDir: string
  private readonly statePath: string
  private readonly stateTmpPath: string
  private readonly memoryPath: string
  private readonly rulesPath: string
  private readonly plansDir: string
  private readonly notepadsDir: string
  private readonly gitignorePath: string
  private readonly generatesGitignore: boolean
  private readonly unavailableReason?: string

  constructor(rootDir: string, options: AnchorStoreOptions = {}) {
    this.unavailableReason = options.unavailableReason
    this.generatesGitignore = options.anchorDir === undefined
    this.anchorDir = options.anchorDir ?? join(rootDir, ANCHOR_DIR)
    this.statePath = join(this.anchorDir, STATE_FILE)
    this.stateTmpPath = this.statePath + ".tmp"
    this.memoryPath = join(this.anchorDir, MEMORY_FILE)
    this.rulesPath = join(this.anchorDir, RULES_FILE)
    this.plansDir = join(this.anchorDir, PLANS_DIR)
    this.notepadsDir = join(this.anchorDir, NOTEPADS_DIR)
    this.gitignorePath = join(this.anchorDir, GITIGNORE_FILE)
  }

  // ── Availability guard ────────────────────────────────────────

  private assertAvailable(): void {
    if (this.unavailableReason) {
      throw new Error(this.unavailableReason)
    }
  }

  // ── Directory management ──────────────────────────────────────

  private ensureAnchorDir(): void {
    if (!existsSync(this.anchorDir)) {
      mkdirSync(this.anchorDir, { recursive: true })
      mkdirSync(this.plansDir, { recursive: true })
      mkdirSync(this.notepadsDir, { recursive: true })
    }
    // Project scope only, create-if-absent, never clobber a file the user
    // may have extended (e.g. to also ignore memory.jsonl).
    if (this.generatesGitignore && !existsSync(this.gitignorePath)) {
      writeFileSync(this.gitignorePath, ANCHOR_GITIGNORE, "utf-8")
    }
  }

  // ── State JSON (atomic writes) ────────────────────────────────

  readState(): AnchorState {
    this.assertAvailable()
    if (!existsSync(this.statePath)) {
      return this.defaultState()
    }
    try {
      const raw = readFileSync(this.statePath, "utf-8")
      return JSON.parse(raw) as AnchorState
    } catch {
      // Corrupt state — return default so tools still work
      console.error("anchor-mcp: corrupt state.json, resetting to default")
      return this.defaultState()
    }
  }

  writeState(state: AnchorState): void {
    this.assertAvailable()
    this.ensureAnchorDir()
    state.version = SCHEMA_VERSION
    state.updatedAt = nowIso()
    const json = JSON.stringify(state, null, 2)
    writeFileSync(this.stateTmpPath, json, "utf-8")
    renameSync(this.stateTmpPath, this.statePath)
  }

  private defaultState(): AnchorState {
    return {
      version: SCHEMA_VERSION,
      activeTask: null,
      tasks: [],
      updatedAt: nowIso(),
    }
  }

  // ── Task operations ───────────────────────────────────────────

  getActiveTask(): Task | null {
    this.assertAvailable()
    const state = this.readState()
    if (!state.activeTask) return null
    return state.tasks.find(t => t.id === state.activeTask) ?? null
  }

  setActiveTask(description: string): Task {
    this.assertAvailable()
    const state = this.readState()
    const task: Task = {
      id: generateId(),
      description,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    state.tasks.push(task)
    state.activeTask = task.id
    this.writeState(state)
    return task
  }

  completeTask(taskId: string): Task | null {
    this.assertAvailable()
    const state = this.readState()
    const task = state.tasks.find(t => t.id === taskId)
    if (!task) return null
    task.status = "completed"
    task.updatedAt = nowIso()
    if (state.activeTask === taskId) {
      state.activeTask = null
    }
    this.writeState(state)
    return task
  }

  listTasks(status?: TaskStatus): Task[] {
    this.assertAvailable()
    const state = this.readState()
    if (status) {
      return state.tasks.filter(t => t.status === status)
    }
    return state.tasks
  }

  // ── Memory (append-only JSONL) ────────────────────────────────

  addMemory(content: string, tags: string[] = []): MemoryEntry {
    this.assertAvailable()
    this.ensureAnchorDir()
    const entry: MemoryEntry = {
      content,
      tags,
      timestamp: nowIso(),
    }
    appendFileSync(this.memoryPath, JSON.stringify(entry) + "\n", "utf-8")
    return entry
  }

  readMemory(): MemoryEntry[] {
    this.assertAvailable()
    if (!existsSync(this.memoryPath)) return []
    const raw = readFileSync(this.memoryPath, "utf-8")
    const entries: MemoryEntry[] = []
    for (const line of raw.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        entries.push(JSON.parse(trimmed))
      } catch {
        // Skip corrupt lines
        console.error(`anchor-mcp: skipping corrupt memory line: ${trimmed.slice(0, 50)}`)
      }
    }
    return entries
  }

  searchMemory(query: string, limit: number = 20): MemoryEntry[] {
    this.assertAvailable()
    const lower = query.toLowerCase()
    return this.readMemory()
      .filter(e => e.content.toLowerCase().includes(lower) || e.tags.some(t => t.toLowerCase().includes(lower)))
      .slice(-limit)
  }

  // ── Plans ─────────────────────────────────────────────────────

  getPlan(name: string): string | null {
    this.assertAvailable()
    const planPath = join(this.plansDir, name, "plan.md")
    if (!existsSync(planPath)) return null
    return readFileSync(planPath, "utf-8")
  }

  getPlanSection(name: string, section: string): string | null {
    this.assertAvailable()
    const sectionPath = join(this.plansDir, name, `${section}.md`)
    if (!existsSync(sectionPath)) return null
    return readFileSync(sectionPath, "utf-8")
  }

  savePlan(name: string, content: string, section: string = "plan"): void {
    this.assertAvailable()
    this.ensureAnchorDir()
    const planDir = join(this.plansDir, name)
    mkdirSync(planDir, { recursive: true })
    writeFileSync(join(planDir, `${section}.md`), content, "utf-8")
  }

  listPlans(): string[] {
    this.assertAvailable()
    if (!existsSync(this.plansDir)) return []
    return readdirSync(this.plansDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  }

  // ── Notepads ──────────────────────────────────────────────────

  getNotepad(topic: string): string | null {
    this.assertAvailable()
    const path = join(this.notepadsDir, `${topic}.md`)
    if (!existsSync(path)) return null
    return readFileSync(path, "utf-8")
  }

  saveNotepad(topic: string, content: string): void {
    this.assertAvailable()
    this.ensureAnchorDir()
    writeFileSync(join(this.notepadsDir, `${topic}.md`), content, "utf-8")
  }

  listNotepads(): string[] {
    this.assertAvailable()
    if (!existsSync(this.notepadsDir)) return []
    return readdirSync(this.notepadsDir)
      .filter(f => f.endsWith(".md"))
      .map(f => f.slice(0, -3))
  }

  // ── Rules ─────────────────────────────────────────────────────

  getRules(): string {
    this.assertAvailable()
    if (!existsSync(this.rulesPath)) return ""
    return readFileSync(this.rulesPath, "utf-8")
  }

  saveRules(content: string): void {
    this.assertAvailable()
    this.ensureAnchorDir()
    writeFileSync(this.rulesPath, content, "utf-8")
  }

  // ── Promote learning ──────────────────────────────────────────

  promoteLearning(planName: string): string | null {
    this.assertAvailable()
    const learningsPath = join(this.plansDir, planName, "learnings.md")
    if (!existsSync(learningsPath)) return null
    const learnings = readFileSync(learningsPath, "utf-8")
    const rules = this.getRules()
    const promoted = `---\n# Promoted from plan: ${planName}\n${learnings}\n`
    this.saveRules(rules + promoted)
    return promoted
  }
}
