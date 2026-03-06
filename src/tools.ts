import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SerialPort } from "serialport";
import { z } from "zod";
import { ConnectionManager } from "./connection-manager.js";

export function registerTools(
  server: McpServer,
  manager: ConnectionManager
): void {
  server.tool("list_ports", "List available serial ports", {}, async () => {
    const ports = await SerialPort.list();
    if (ports.length === 0) {
      return { content: [{ type: "text", text: "No serial ports found." }] };
    }

    const info = ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer ?? "unknown",
      serialNumber: p.serialNumber ?? "unknown",
      vendorId: p.vendorId ?? "unknown",
      productId: p.productId ?? "unknown",
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
    };
  });

  server.tool(
    "open_port",
    "Open a serial connection to a device",
    {
      path: z.string().describe("Serial port path (e.g. /dev/tty.usbserial-110)"),
      baudRate: z.number().default(9600).describe("Baud rate (default: 9600)"),
      dataBits: z
        .union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)])
        .default(8)
        .describe("Data bits (default: 8)"),
      stopBits: z
        .union([z.literal(1), z.literal(1.5), z.literal(2)])
        .default(1)
        .describe("Stop bits (default: 1)"),
      parity: z
        .enum(["none", "even", "odd", "mark", "space"])
        .default("none")
        .describe("Parity (default: none)"),
    },
    async ({ path, baudRate, dataBits, stopBits, parity }) => {
      try {
        await manager.open({ path, baudRate, dataBits, stopBits, parity });
        return {
          content: [
            {
              type: "text",
              text: `Opened ${path} at ${baudRate} baud (${dataBits}${parity[0].toUpperCase()}${stopBits})`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to open ${path}: ${err instanceof Error ? err.message : err}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "close_port",
    "Close an open serial connection",
    {
      path: z.string().describe("Serial port path to close"),
    },
    async ({ path }) => {
      try {
        await manager.close(path);
        return {
          content: [{ type: "text", text: `Closed ${path}` }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to close ${path}: ${err instanceof Error ? err.message : err}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "send_command",
    "Send a command to a Cisco device and wait for the prompt. Handles -- More -- pagination automatically.",
    {
      path: z.string().describe("Serial port path"),
      command: z.string().describe("Command to send (e.g. 'show version')"),
      timeout: z
        .number()
        .default(10000)
        .describe("Timeout in ms to wait for prompt (default: 10000)"),
    },
    async ({ path, command, timeout }) => {
      try {
        const output = await manager.sendCommand(path, command, timeout);
        return {
          content: [{ type: "text", text: output }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Command failed: ${err instanceof Error ? err.message : err}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "write_raw",
    "Write raw string data to a serial port (no prompt waiting)",
    {
      path: z.string().describe("Serial port path"),
      data: z.string().describe("Raw data to write"),
    },
    async ({ path, data }) => {
      try {
        // Process common escape sequences
        const processed = data
          .replace(/\\r/g, "\r")
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16))
          );
        manager.write(path, processed);
        return {
          content: [
            {
              type: "text",
              text: `Wrote ${processed.length} characters to ${path}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Write failed: ${err instanceof Error ? err.message : err}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "read_buffer",
    "Read buffered data from a serial port (non-blocking)",
    {
      path: z.string().describe("Serial port path"),
    },
    async ({ path }) => {
      try {
        const data = manager.readBuffer(path);
        if (data.length === 0) {
          return {
            content: [{ type: "text", text: "(buffer empty)" }],
          };
        }
        return {
          content: [{ type: "text", text: data }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Read failed: ${err instanceof Error ? err.message : err}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_connections",
    "List all open serial connections and their settings",
    {},
    async () => {
      const connections = manager.listConnections();
      if (connections.length === 0) {
        return {
          content: [{ type: "text", text: "No open connections." }],
        };
      }
      return {
        content: [
          { type: "text", text: JSON.stringify(connections, null, 2) },
        ],
      };
    }
  );
}
