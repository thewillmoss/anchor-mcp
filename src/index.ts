/**
 * anchor-mcp — Portable agent working state MCP server
 *
 * Any AI coding agent drops anchor here.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { detectWorktreeRoot, resolveUserAnchorDir } from "./worktree.js";
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

// Project scope requires a git worktree. Outside one, don't crash the whole
// server (a globally-configured anchor would otherwise fail in every
// non-git session) — catch here and let project-scope tools fail clearly,
// per call, while user-scope memory/notepad tools keep working anywhere.
let worktreeError: string | undefined;
let rootDir = "";
try {
  rootDir = detectWorktreeRoot();
} catch (error) {
  worktreeError = error instanceof Error ? error.message : String(error);
}

const projectStore = new AnchorStore(rootDir, { unavailableReason: worktreeError });
const userStore = new AnchorStore("", { anchorDir: resolveUserAnchorDir() });

registerTaskTools(server, projectStore);
registerPlanTools(server, projectStore);
registerNotepadTools(server, projectStore, userStore);
registerMemoryTools(server, projectStore, userStore);
registerRulesTools(server, projectStore);
registerPromoteTool(server, projectStore);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
