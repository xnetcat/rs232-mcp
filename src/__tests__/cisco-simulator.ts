import { SerialPortMock } from "serialport";
import { MockPortBinding } from "@serialport/binding-mock";

export type PromptMode = "user" | "privileged" | "config" | "config-if";

const PROMPT_SUFFIXES: Record<PromptMode, string> = {
  user: ">",
  privileged: "#",
  config: "(config)#",
  "config-if": "(config-if)#",
};

interface CommandResponse {
  output: string;
  paginate?: boolean;
}

export class CiscoSimulator {
  private hostname: string;
  private mode: PromptMode;
  private commands = new Map<string, CommandResponse>();
  private inputBuffer = "";
  private waitingForSpace = false;
  private pendingSecondPage = "";

  constructor(
    private port: SerialPortMock,
    options?: { hostname?: string; mode?: PromptMode }
  ) {
    this.hostname = options?.hostname ?? "Router";
    this.mode = options?.mode ?? "privileged";
    this.interceptWrites();
  }

  get prompt(): string {
    return `${this.hostname}${PROMPT_SUFFIXES[this.mode]}`;
  }

  setMode(mode: PromptMode): void {
    this.mode = mode;
  }

  registerCommand(command: string, output: string, paginate = false): void {
    this.commands.set(command.trim(), { output, paginate });
  }

  private interceptWrites(): void {
    const binding = this.port.port as MockPortBinding;
    const originalWrite = binding.write.bind(binding);

    binding.write = async (buffer: Buffer): Promise<void> => {
      await originalWrite(buffer);
      const str = buffer.toString("utf-8");
      this.handleWrite(str);
    };
  }

  private handleWrite(str: string): void {
    // Handle space for pagination
    if (this.waitingForSpace && str === " ") {
      this.waitingForSpace = false;
      const secondPage = this.pendingSecondPage;
      this.pendingSecondPage = "";
      this.emitData(`\r${secondPage}\r\n${this.prompt} `);
      return;
    }

    this.inputBuffer += str;

    // Check for complete command (ends with \r\n)
    if (!this.inputBuffer.includes("\r\n")) return;

    const command = this.inputBuffer.replace(/\r\n$/, "").trim();
    this.inputBuffer = "";

    const response = this.commands.get(command);
    if (response) {
      if (response.paginate) {
        this.emitPaginatedResponse(command, response.output);
      } else {
        this.emitResponse(command, response.output);
      }
    } else {
      this.emitData(`${command}\r\n% Unknown command\r\n${this.prompt} `);
    }
  }

  private emitResponse(command: string, output: string): void {
    const full = output
      ? `${command}\r\n${output}\r\n${this.prompt} `
      : `${command}\r\n${this.prompt} `;
    this.emitData(full);
  }

  private emitPaginatedResponse(command: string, output: string): void {
    const lines = output.split("\n");
    const pageSize = Math.ceil(lines.length / 2);
    const firstPage = lines.slice(0, pageSize).join("\r\n");
    const secondPage = lines.slice(pageSize).join("\r\n");

    this.waitingForSpace = true;
    this.pendingSecondPage = secondPage;

    this.emitData(`${command}\r\n${firstPage}\r\n --More-- `);
  }

  private emitData(data: string): void {
    process.nextTick(() => {
      const binding = this.port.port as MockPortBinding;
      if (binding && binding.isOpen) {
        binding.emitData(Buffer.from(data, "utf-8"));
      }
    });
  }
}
