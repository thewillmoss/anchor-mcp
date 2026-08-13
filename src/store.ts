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
  lstatSync,
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
  /**
   * When true, the anchor directory is created 0o700 and files 0o600
   * instead of default umask perms. Set for the user store — the README
   * tells people to keep personal data there.
   */
  privateMode?: boolean
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
  private readonly privateMode: boolean

  constructor(rootDir: string, options: AnchorStoreOptions = {}) {
    this.unavailableReason = options.unavailableReason
    this.generatesGitignore = options.anchorDir === undefined
    this.privateMode = options.privateMode ?? false
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
   * Reject anything that could escape the anchor directory or isn't a
   * sane filename. `topic`, plan `name`, plan `section`, and `planName`
   * are user/LLM-controlled and get joined straight into filesystem
   * paths. This is a denylist, not an allowlist: v0.1 data may have
   * spaces or unicode in these fields (both legal, both fine on disk),
   * so only traversal-shaped or otherwise unsafe values are rejected.
   */
  private validateIdentifier(value: string, paramName: string): void {
    let reason: string | null = null
    if (value.length === 0) {
      reason = "must not be empty"
    } else if (value.includes("/") || value.includes("\\")) {
      reason = "must not contain '/' or '\\'"
    } else if (value.includes("..")) {
      reason = "must not contain '..'"
    } else if (value.startsWith(".")) {
      reason = "must not start with '.'"
    } else {
      for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) < 0x20) {
          reason = "must not contain control characters"
          break
        }
      }
    }
    if (reason) {
      throw new Error(`anchor-mcp: invalid ${paramName} '${value}' — ${reason}`)
    }
  }

  /**
   * Refuse to read or write through a symlink. A committed .anchor/ is
   * attacker-controlled the moment it's someone else's repo — a notepad,
   * memory.jsonl, rules.md, or plan file committed as a symlink to an
   * arbitrary host path would otherwise expose that path on read, or
   * corrupt it on append/write. lstat (not stat) so the check sees the
   * link itself rather than resolving through it.
   */
  private assertNotSymlink(path: string): void {
    let stat
    try {
      stat = lstatSync(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`anchor-mcp: refusing to follow symlink at '${path}'`)
    }
  }

  // ── Directory management ──────────────────────────────────────

  private ensureAnchorDir(): void {
    const dirOptions = this.privateMode
      ? { recursive: true as const, mode: 0o700 }
      : { recursive: true as const }
    mkdirSync(this.anchorDir, dirOptions)
    // Idempotent even against a partial/committed .anchor/ (e.g. a fresh
    // clone that has .gitignore + memory.jsonl but no notepads/ yet).
    mkdirSync(this.plansDir, dirOptions)
    mkdirSync(this.notepadsDir, dirOptions)
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
    writeFileSync(tmpPath, content, this.privateMode ? { encoding: "utf-8", mode: 0o600 } : "utf-8")
    renameSync(tmpPath, targetPath)
  }

  // ── State JSON (atomic writes) ────────────────────────────────

  readState(): AnchorState {
    this.assertAvailable()
    this.assertNotSymlink(this.statePath)
    if (!existsSync(this.statePath)) {
      return this.defaultState()
    }
    try {
      const raw = readFileSync(this.statePath, "utf-8")
      return JSON.parse(raw) as AnchorState
    } catch {
      // Corrupt state — preserve the original (best-effort) before
      // resetting to default, so a bad write never silently destroys it.
      const corruptPath = `${this.statePath}.corrupt`
      let preserved = false
      try {
        renameSync(this.statePath, corruptPath)
        preserved = true
      } catch {
        // best-effort — fall through to default state either way
      }
      console.error(
        preserved
          ? `anchor-mcp: corrupt state.json, preserved as ${corruptPath} and reset to default`
          : "anchor-mcp: corrupt state.json, resetting to default (could not preserve original)"
      )
      return this.defaultState()
    }
  }

  writeState(state: AnchorState): void {
    this.assertAvailable()
    this.assertNotSymlink(this.statePath)
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
    this.assertNotSymlink(this.memoryPath)
    this.ensureAnchorDir()
    const entry: MemoryEntry = {
      content,
      tags,
      timestamp: nowIso(),
    }
    appendFileSync(
      this.memoryPath,
      JSON.stringify(entry) + "\n",
      this.privateMode ? { encoding: "utf-8", mode: 0o600 } : "utf-8"
    )
    return entry
  }

  readMemory(): MemoryEntry[] {
    this.assertAvailable()
    this.assertNotSymlink(this.memoryPath)
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
    this.assertNotSymlink(planPath)
    if (!existsSync(planPath)) return null
    return readFileSync(planPath, "utf-8")
  }

  getPlanSection(name: string, section: string): string | null {
    this.assertAvailable()
    this.validateIdentifier(name, "name")
    this.validateIdentifier(section, "section")
    const sectionPath = join(this.plansDir, name, `${section}.md`)
    this.assertNotSymlink(sectionPath)
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
    const sectionPath = join(planDir, `${section}.md`)
    this.assertNotSymlink(sectionPath)
    this.writeFileAtomic(sectionPath, content)
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
    this.assertNotSymlink(path)
    if (!existsSync(path)) return null
    return readFileSync(path, "utf-8")
  }

  saveNotepad(topic: string, content: string): void {
    this.assertAvailable()
    this.validateIdentifier(topic, "topic")
    const path = join(this.notepadsDir, `${topic}.md`)
    this.assertNotSymlink(path)
    this.ensureAnchorDir()
    this.writeFileAtomic(path, content)
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
    this.assertNotSymlink(this.rulesPath)
    if (!existsSync(this.rulesPath)) return ""
    return readFileSync(this.rulesPath, "utf-8")
  }

  saveRules(content: string): void {
    this.assertAvailable()
    this.assertNotSymlink(this.rulesPath)
    this.ensureAnchorDir()
    this.writeFileAtomic(this.rulesPath, content)
  }

  // ── Promote learning ──────────────────────────────────────────

  promoteLearning(planName: string): string | null {
    this.assertAvailable()
    this.validateIdentifier(planName, "planName")
    const learningsPath = join(this.plansDir, planName, "learnings.md")
    this.assertNotSymlink(learningsPath)
    if (!existsSync(learningsPath)) return null
    const learnings = readFileSync(learningsPath, "utf-8")
    const rules = this.getRules()
    const promoted = `---\n# Promoted from plan: ${planName}\n${learnings}\n`
    this.saveRules(rules + promoted)
    return promoted
  }
}
