/**
 * Anchor MCP — Task Manager Tool
 *
 * Manages the active task and task list for the current worktree.
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { AnchorStore } from "../store.js"

const TaskAction = z.enum(["get_active", "set_active", "complete", "list"])

const TaskManagerSchema = {
  action: TaskAction.describe("The task action to perform"),
  taskId: z.string().optional().describe("Task ID (for complete action)"),
  description: z.string().optional().describe("Task description (for set_active action)"),
  status: z.enum(["active", "completed", "cancelled"]).optional().describe("Filter by status (for list action)"),
}

export function registerTaskTools(server: McpServer, store: AnchorStore): void {
  server.tool(
    "task_manager",
    "Manage tasks: get active task, set a new active task, complete a task, or list all tasks.",
    TaskManagerSchema,
    async (params) => {
      try {
        switch (params.action) {
          case "get_active": {
            const task = store.getActiveTask()
            return {
              content: task
                ? [{ type: "text" as const, text: JSON.stringify(task, null, 2) }]
                : [{ type: "text" as const, text: "No active task." }],
            }
          }
          case "set_active": {
            if (!params.description) {
              return { content: [{ type: "text" as const, text: "Error: description is required for set_active" }] }
            }
            const task = store.setActiveTask(params.description)
            return { content: [{ type: "text" as const, text: JSON.stringify(task, null, 2) }] }
          }
          case "complete": {
            if (!params.taskId) {
              return { content: [{ type: "text" as const, text: "Error: taskId is required for complete" }] }
            }
            const task = store.completeTask(params.taskId)
            return {
              content: task
                ? [{ type: "text" as const, text: JSON.stringify(task, null, 2) }]
                : [{ type: "text" as const, text: "Task not found." }],
            }
          }
          case "list": {
            const tasks = store.listTasks(params.status)
            return {
              content: tasks.length > 0
                ? [{ type: "text" as const, text: JSON.stringify(tasks, null, 2) }]
                : [{ type: "text" as const, text: "No tasks." }],
            }
          }
        }
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error}` }] }
      }
    }
  )
}