import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SerialPortMock } from "serialport";
import { ConnectionManager, type PortConfig, type SerialPortConstructor } from "../connection-manager.js";
import { CiscoSimulator } from "./cisco-simulator.js";

const TEST_PATH = "/dev/ttyUSB0";
const DEFAULT_CONFIG: PortConfig = {
  path: TEST_PATH,
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
};

function createManager(): ConnectionManager {
  return new ConnectionManager(SerialPortMock as unknown as SerialPortConstructor);
}

describe("ConnectionManager", () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
    SerialPortMock.binding.createPort(TEST_PATH, { echo: false });
  });

  afterEach(async () => {
    SerialPortMock.binding.reset();
  });

  describe("port management", () => {
    it("should open a port successfully", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);
      const conns = mgr.listConnections();
      expect(conns).toHaveLength(1);
      expect(conns[0].path).toBe(TEST_PATH);
    });

    it("should reject duplicate open on same path", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);
      await expect(mgr.open(DEFAULT_CONFIG)).rejects.toThrow("already open");
    });

    it("should close an open port", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);
      await mgr.close(TEST_PATH);
      expect(mgr.listConnections()).toHaveLength(0);
    });

    it("should error closing non-existent port", async () => {
      const mgr = createManager();
      await expect(mgr.close("/dev/nonexistent")).rejects.toThrow("not open");
    });

    it("should closeAll() all connections", async () => {
      SerialPortMock.binding.createPort("/dev/ttyUSB1", { echo: false });
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);
      await mgr.open({ ...DEFAULT_CONFIG, path: "/dev/ttyUSB1" });
      expect(mgr.listConnections()).toHaveLength(2);
      await mgr.closeAll();
      expect(mgr.listConnections()).toHaveLength(0);
    });

    it("should listConnections() with correct metadata", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);
      const conns = mgr.listConnections();
      expect(conns).toHaveLength(1);
      expect(conns[0].config).toEqual(DEFAULT_CONFIG);
      expect(conns[0].openedAt).toBeDefined();
      expect(conns[0].bufferedBytes).toBe(0);
    });
  });

  describe("data buffering", () => {
    it("should write data to port", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);
      expect(() => mgr.write(TEST_PATH, "test data")).not.toThrow();
    });

    it("should return buffered data and clear buffer", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;
      port.port!.emitData(Buffer.from("hello world", "utf-8"));

      // Wait for data event to propagate
      await new Promise((r) => setTimeout(r, 50));

      const data = mgr.readBuffer(TEST_PATH);
      expect(data).toBe("hello world");

      // Buffer should be cleared
      expect(mgr.readBuffer(TEST_PATH)).toBe("");
    });

    it("should strip carriage returns from buffer", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;
      port.port!.emitData(Buffer.from("line1\r\nline2\r\n", "utf-8"));

      await new Promise((r) => setTimeout(r, 50));

      const data = mgr.readBuffer(TEST_PATH);
      expect(data).toBe("line1\nline2\n");
    });

    it("should return empty string when no data", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);
      expect(mgr.readBuffer(TEST_PATH)).toBe("");
    });
  });

  describe("sendCommand()", () => {
    it("should return output when Cisco prompt detected", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;
      const sim = new CiscoSimulator(port);

      sim.registerCommand("show version", "Cisco IOS Software, Version 15.1");

      const result = await mgr.sendCommand(TEST_PATH, "show version");
      expect(result).toContain("Cisco IOS Software, Version 15.1");
    });

    it("should strip echoed command from output", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;
      const sim = new CiscoSimulator(port);

      sim.registerCommand("show ip route", "10.0.0.0/8 via 192.168.1.1");

      const result = await mgr.sendCommand(TEST_PATH, "show ip route");
      expect(result).not.toMatch(/^show ip route/);
      expect(result).toContain("10.0.0.0/8 via 192.168.1.1");
    });

    it("should handle user mode prompt (Router>)", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;
      const sim = new CiscoSimulator(port, { mode: "user" });

      sim.registerCommand("show version", "IOS Version 15.1");

      const result = await mgr.sendCommand(TEST_PATH, "show version");
      expect(result).toContain("IOS Version 15.1");
      expect(result).toContain("Router>");
    });

    it("should handle config mode prompt (Router(config)#)", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;
      const sim = new CiscoSimulator(port, { mode: "config" });

      sim.registerCommand("hostname TestRouter", "");

      const result = await mgr.sendCommand(TEST_PATH, "hostname TestRouter");
      expect(result).toContain("Router(config)#");
    });

    it("should handle config-if mode prompt (Router(config-if)#)", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;
      const sim = new CiscoSimulator(port, { mode: "config-if" });

      sim.registerCommand("ip address 10.0.0.1 255.255.255.0", "");

      const result = await mgr.sendCommand(
        TEST_PATH,
        "ip address 10.0.0.1 255.255.255.0"
      );
      expect(result).toContain("Router(config-if)#");
    });

    it("should handle --More-- pagination", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;
      const sim = new CiscoSimulator(port);

      const longOutput = [
        "Interface    IP-Address      OK?",
        "Ethernet0    10.0.0.1        YES",
        "Ethernet1    10.0.1.1        YES",
        "Serial0      192.168.1.1     YES",
      ].join("\n");

      sim.registerCommand("show ip interface brief", longOutput, true);

      const result = await mgr.sendCommand(TEST_PATH, "show ip interface brief");
      expect(result).toContain("Ethernet0");
      expect(result).toContain("Serial0");
      expect(result).not.toContain("--More--");
    });

    it("should return partial output on timeout", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;

      // Emit data without a prompt so it times out
      process.nextTick(() => {
        port.port!.emitData(Buffer.from("partial output without prompt\r\n", "utf-8"));
      });

      const result = await mgr.sendCommand(TEST_PATH, "show running-config", 200);
      expect(result).toContain("partial output without prompt");
    });

    it("should strip \\r from output", async () => {
      const mgr = createManager();
      await mgr.open(DEFAULT_CONFIG);

      const conn = mgr.getConnection(TEST_PATH);
      const port = conn.port as unknown as SerialPortMock;
      const sim = new CiscoSimulator(port);

      sim.registerCommand("show clock", "12:00:00 UTC Mon Mar 4 2026");

      const result = await mgr.sendCommand(TEST_PATH, "show clock");
      expect(result).not.toContain("\r");
    });
  });
});
