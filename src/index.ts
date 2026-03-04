#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConnectionManager } from "./connection-manager.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "rs232-mcp",
  version: "1.0.0",
});

const manager = new ConnectionManager();

registerTools(server, manager);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[rs232-mcp] Server started");
}

async function shutdown() {
  console.error("[rs232-mcp] Shutting down...");
  await manager.closeAll();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("[rs232-mcp] Fatal error:", err);
  process.exit(1);
});
