#!/usr/bin/env node

/**
 * anchor-mcp — Portable agent working state MCP server
 *
 * Any AI coding agent drops anchor here.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "anchor-mcp",
  version: "0.1.0",
});

// TODO: Initialize AnchorStore from detected worktree
// TODO: Register task tools
// TODO: Register notepad tools
// TODO: Register plan tools
// TODO: Register memory tools
// TODO: Register rule tools

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
