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
}

export interface MemoryManagerInput {
  action: "add" | "search" | "list"
  content?: string
  tags?: string[]
  query?: string
  limit?: number
}

export interface RulesManagerInput {
  action: "get" | "save"
  content?: string
}

export interface PromoteLearningInput {
  planName: string
  learningIndex?: number
}