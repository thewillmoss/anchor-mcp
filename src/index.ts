#!/usr/bin/env node

/**
 * anchor-mcp — Portable agent working state MCP server
 *
 * Any AI coding agent drops anchor here.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { detectWorktreeRoot } from "./worktree.js";
import { AnchorStore } from "./store.js";
import { registerTaskTools } from "./tools/task.js";
import { registerPlanTools } from "./tools/plan.js";
import { registerNotepadTools } from "./tools/notepad.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerRulesTools } from "./tools/rules.js";
import { registerPromoteTool } from "./tools/promote.js";

const server = new McpServer({
  name: "anchor-mcp",
  version: "0.1.0",
});

const rootDir = detectWorktreeRoot();
const store = new AnchorStore(rootDir);

registerTaskTools(server, store);
registerPlanTools(server, store);
registerNotepadTools(server, store);
registerMemoryTools(server, store);
registerRulesTools(server, store);
registerPromoteTool(server, store);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
