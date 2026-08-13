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

/** Matches a single filename-safe path segment: no separators, no leading dot. */
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

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
    this.memoryPath = join(this.anchorDir, MEMORY_FILE)
    this.rulesPath = join(this.anchorDir, RULES_FILE)
    this.plansDir = join(this.anchorDir, PLANS_DIR)
    this.notepadsDir = join(this.anchorDir, NOTEPADS_DIR)
    this.gitignorePath = join(this.anchorDir, GITIGNORE_FILE)
  }

  /** Absolute path to this store's anchor directory (used to detect project/user scope collisions). */
  get anchorDirPath(): string {
    return this.anchorDir
  }

  /** False when this store was constructed outside a git repository (project scope only). */
  get available(): boolean {
    return this.unavailableReason === undefined
  }

  // ── Availability guard ────────────────────────────────────────

  private assertAvailable(): void {
    if (this.unavailableReason) {
      throw new Error(this.unavailableReason)
    }
  }

  /**
   * Reject anything but a plain filename-safe identifier. `topic`, plan
   * `name`, and plan `section` are user/LLM-controlled and get joined
   * straight into filesystem paths — without this, "../../etc" style
   * values could escape the anchor directory entirely.
   */
  private validateIdentifier(value: string, paramName: string): void {
    if (!SAFE_IDENTIFIER.test(value) || value.includes("..")) {
      throw new Error(
        `anchor-mcp: invalid ${paramName} '${value}' — must contain only letters, numbers, ` +
        `'.', '_', '-', start with a letter or number, and not contain '..'`
      )
    }
  }

  // ── Directory management ──────────────────────────────────────

  private ensureAnchorDir(): void {
    mkdirSync(this.anchorDir, { recursive: true })
    // Idempotent even against a partial/committed .anchor/ (e.g. a fresh
    // clone that has .gitignore + memory.jsonl but no notepads/ yet).
    mkdirSync(this.plansDir, { recursive: true })
    mkdirSync(this.notepadsDir, { recursive: true })
    // Project scope only, create-if-absent, never clobber a file the user
    // may have extended (e.g. to also ignore memory.jsonl). "wx" is
    // atomically create-exclusive — safe even against a dangling symlink.
    if (this.generatesGitignore) {
      try {
        writeFileSync(this.gitignorePath, ANCHOR_GITIGNORE, { encoding: "utf-8", flag: "wx" })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      }
    }
  }

  /** Write-to-temp (unique per process+call) + rename, for crash-safe writes to `targetPath`. */
  private writeFileAtomic(targetPath: string, content: string): void {
    const tmpPath = `${targetPath}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
    writeFileSync(tmpPath, content, "utf-8")
    renameSync(tmpPath, targetPath)
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
    this.writeFileAtomic(this.statePath, JSON.stringify(state, null, 2))
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
      const entry = this.parseMemoryLine(trimmed)
      if (entry) {
        entries.push(entry)
      } else {
        console.error(`anchor-mcp: skipping corrupt memory line: ${trimmed.slice(0, 50)}`)
      }
    }
    return entries
  }

  /** Parse + shape-validate one JSONL line. One malformed entry must not take down search/list for the rest. */
  private parseMemoryLine(line: string): MemoryEntry | null {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }
    if (typeof parsed !== "object" || parsed === null) return null
    const candidate = parsed as Record<string, unknown>
    if (typeof candidate.content !== "string" || typeof candidate.timestamp !== "string") return null
    return {
      content: candidate.content,
      timestamp: candidate.timestamp,
      tags: Array.isArray(candidate.tags) ? candidate.tags.filter((t): t is string => typeof t === "string") : [],
    }
  }

  searchMemory(query: string, limit?: number): MemoryEntry[] {
    this.assertAvailable()
    const lower = query.toLowerCase()
    const matches = this.readMemory()
      .filter(e => e.content.toLowerCase().includes(lower) || e.tags.some(t => t.toLowerCase().includes(lower)))
    return limit === undefined ? matches : matches.slice(-limit)
  }

  // ── Plans ─────────────────────────────────────────────────────

  getPlan(name: string): string | null {
    this.assertAvailable()
    this.validateIdentifier(name, "name")
    const planPath = join(this.plansDir, name, "plan.md")
    if (!existsSync(planPath)) return null
    return readFileSync(planPath, "utf-8")
  }

  getPlanSection(name: string, section: string): string | null {
    this.assertAvailable()
    this.validateIdentifier(name, "name")
    this.validateIdentifier(section, "section")
    const sectionPath = join(this.plansDir, name, `${section}.md`)
    if (!existsSync(sectionPath)) return null
    return readFileSync(sectionPath, "utf-8")
  }

  savePlan(name: string, content: string, section: string = "plan"): void {
    this.assertAvailable()
    this.validateIdentifier(name, "name")
    this.validateIdentifier(section, "section")
    this.ensureAnchorDir()
    const planDir = join(this.plansDir, name)
    mkdirSync(planDir, { recursive: true })
    this.writeFileAtomic(join(planDir, `${section}.md`), content)
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
    this.validateIdentifier(topic, "topic")
    const path = join(this.notepadsDir, `${topic}.md`)
    if (!existsSync(path)) return null
    return readFileSync(path, "utf-8")
  }

  saveNotepad(topic: string, content: string): void {
    this.assertAvailable()
    this.validateIdentifier(topic, "topic")
    this.ensureAnchorDir()
    this.writeFileAtomic(join(this.notepadsDir, `${topic}.md`), content)
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
    this.writeFileAtomic(this.rulesPath, content)
  }

  // ── Promote learning ──────────────────────────────────────────

  promoteLearning(planName: string): string | null {
    this.assertAvailable()
    this.validateIdentifier(planName, "planName")
    const learningsPath = join(this.plansDir, planName, "learnings.md")
    if (!existsSync(learningsPath)) return null
    const learnings = readFileSync(learningsPath, "utf-8")
    const rules = this.getRules()
    const promoted = `---\n# Promoted from plan: ${planName}\n${learnings}\n`
    this.saveRules(rules + promoted)
    return promoted
  }
}
