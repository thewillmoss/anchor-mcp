/**
 * Anchor MCP — Plan Manager Tool
 *
 * Manages execution plans with linked issues and learnings.
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { AnchorStore } from "../store.js"

const PlanAction = z.enum(["get", "save", "list"])

const PlanManagerSchema = {
  action: PlanAction.describe("The plan action to perform"),
  name: z.string().optional().describe("Plan name (required for get and save)"),
  content: z.string().optional().describe("Plan content in markdown (required for save)"),
  section: z.enum(["plan", "issues", "learnings"]).optional().describe("Plan section (defaults to 'plan')"),
}

export function registerPlanTools(server: McpServer, store: AnchorStore): void {
  server.tool(
    "plan_manager",
    "Manage plans: read a plan, save/update a plan, or list all plan names.",
    PlanManagerSchema,
    async (params) => {
      try {
        switch (params.action) {
          case "get": {
            if (!params.name) {
              return { content: [{ type: "text" as const, text: "Error: name is required for get" }] }
            }
            const section = params.section ?? "plan"
            const content = store.getPlanSection(params.name, section)
            return {
              content: content
                ? [{ type: "text" as const, text: content }]
                : [{ type: "text" as const, text: `Plan '${params.name}' not found.` }],
            }
          }
          case "save": {
            if (!params.name || !params.content) {
              return { content: [{ type: "text" as const, text: "Error: name and content are required for save" }] }
            }
            store.savePlan(params.name, params.content, params.section)
            return { content: [{ type: "text" as const, text: `Plan '${params.name}' saved.` }] }
          }
          case "list": {
            const plans = store.listPlans()
            return {
              content: plans.length > 0
                ? [{ type: "text" as const, text: plans.join("\n") }]
                : [{ type: "text" as const, text: "No plans." }],
            }
          }
        }
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error}` }] }
      }
    }
  )
}