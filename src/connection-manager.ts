import { SerialPort } from "serialport";

export interface PortConfig {
  path: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: "none" | "even" | "odd" | "mark" | "space";
}

interface ManagedConnection {
  port: InstanceType<typeof SerialPort>;
  config: PortConfig;
  buffer: string;
  openedAt: Date;
}

export type SerialPortConstructor = new (options: {
  path: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: "none" | "even" | "odd" | "mark" | "space";
  autoOpen: boolean;
}) => InstanceType<typeof SerialPort>;

const CISCO_PROMPT_RE = /[\w\-\.]+(?:\([^\)]*\))?[>#]\s*$/;
const MORE_RE = / ?--More-- ?/;
const DEFAULT_TIMEOUT_MS = 10_000;

export class ConnectionManager {
  private connections = new Map<string, ManagedConnection>();
  private PortClass: SerialPortConstructor;

  constructor(PortClass?: SerialPortConstructor) {
    this.PortClass = PortClass ?? (SerialPort as unknown as SerialPortConstructor);
  }

  async open(config: PortConfig): Promise<void> {
    if (this.connections.has(config.path)) {
      throw new Error(`Port ${config.path} is already open`);
    }

    const port = new this.PortClass({
      path: config.path,
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
      autoOpen: false,
    });

    await new Promise<void>((resolve, reject) => {
      port.open((err) => (err ? reject(err) : resolve()));
    });

    const managed: ManagedConnection = {
      port,
      config,
      buffer: "",
      openedAt: new Date(),
    };

    port.on("data", (data: Buffer) => {
      managed.buffer += data.toString("utf-8");
    });

    port.on("error", (err) => {
      console.error(`[rs232-mcp] Error on ${config.path}: ${err.message}`);
    });

    this.connections.set(config.path, managed);
  }

  async close(path: string): Promise<void> {
    const conn = this.connections.get(path);
    if (!conn) {
      throw new Error(`Port ${path} is not open`);
    }

    await new Promise<void>((resolve, reject) => {
      conn.port.close((err) => (err ? reject(err) : resolve()));
    });

    this.connections.delete(path);
  }

  async closeAll(): Promise<void> {
    const paths = [...this.connections.keys()];
    for (const path of paths) {
      try {
        await this.close(path);
      } catch (err) {
        console.error(
          `[rs232-mcp] Error closing ${path}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  }

  write(path: string, data: string): void {
    const conn = this.getConnection(path);
    conn.port.write(data);
  }

  readBuffer(path: string): string {
    const conn = this.getConnection(path);
    const data = conn.buffer;
    conn.buffer = "";
    return data.replace(/\r/g, "");
  }

  async sendCommand(
    path: string,
    command: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<string> {
    const conn = this.getConnection(path);

    // Drain any existing buffer
    conn.buffer = "";

    // Send command with CRLF
    conn.port.write(command + "\r\n");

    const output = await new Promise<string>((resolve, reject) => {
      let collected = "";
      const timer = setTimeout(() => {
        cleanup();
        resolve(collected.replace(/\r/g, ""));
      }, timeoutMs);

      const onData = () => {
        collected = conn.buffer;

        // Handle -- More -- pagination
        if (MORE_RE.test(collected)) {
          collected = collected.replace(MORE_RE, "");
          conn.buffer = collected;
          conn.port.write(" "); // send space to continue
          return;
        }

        // Check for Cisco prompt
        if (CISCO_PROMPT_RE.test(collected)) {
          clearTimeout(timer);
          cleanup();
          resolve(collected.replace(/\r/g, ""));
        }
      };

      const onError = (err: Error) => {
        clearTimeout(timer);
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        conn.port.removeListener("data", onData);
        conn.port.removeListener("error", onError);
      };

      conn.port.on("data", onData);
      conn.port.on("error", onError);
    });

    // Clear the buffer since we've consumed the data
    conn.buffer = "";

    // Strip the echoed command from the beginning if present
    const lines = output.split("\n");
    if (lines.length > 0 && lines[0].trim() === command.trim()) {
      lines.shift();
    }

    return lines.join("\n").trim();
  }

  getConnection(path: string): ManagedConnection {
    const conn = this.connections.get(path);
    if (!conn) {
      throw new Error(`Port ${path} is not open`);
    }
    return conn;
  }

  listConnections(): Array<{
    path: string;
    config: PortConfig;
    openedAt: string;
    bufferedBytes: number;
  }> {
    return [...this.connections.entries()].map(([path, conn]) => ({
      path,
      config: conn.config,
      openedAt: conn.openedAt.toISOString(),
      bufferedBytes: conn.buffer.length,
    }));
  }
}
