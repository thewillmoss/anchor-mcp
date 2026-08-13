/**
 * Anchor MCP Types
 *
 * All TypeScript interfaces and type aliases for anchor state.
 */

export interface AnchorState {
  version: 1
  activeTask: string | null
  tasks: Task[]
  updatedAt: string
}

export interface Task {
  id: string
  description: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
}

export type TaskStatus = "active" | "completed" | "cancelled"

export interface MemoryEntry {
  content: string
  tags: string[]
  timestamp: string
}

export type PlanSection = "plan" | "issues" | "learnings"

/**
 * Two-scope model, like git config system/global/local:
 * - "user": ~/.anchor (or ANCHOR_USER_DIR) — private, never committed, follows the developer.
 * - "project": <worktree>/.anchor — shared, PR-reviewed, committed with the code.
 */
export type Scope = "user" | "project"

export interface TaskManagerInput {
  action: "get_active" | "set_active" | "complete" | "list"
  taskId?: string
  description?: string
  status?: TaskStatus
}

export interface PlanManagerInput {
  action: "get" | "save" | "list"
  name?: string
  content?: string
  section?: PlanSection
}

export interface NotepadManagerInput {
  action: "get" | "save" | "list"
  topic?: string
  content?: string
  scope?: Scope
}

export interface MemoryManagerInput {
  action: "add" | "search" | "list"
  content?: string
  tags?: string[]
  query?: string
  limit?: number
  scope?: Scope
}

export interface RulesManagerInput {
  action: "get" | "save"
  content?: string
}

export interface PromoteLearningInput {
  planName: string
}