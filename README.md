# rs232-mcp

MCP server for RS232 serial communication with Cisco network equipment.

Lets AI assistants interact with Cisco routers and switches over serial console connections. Handles prompt detection, `-- More --` pagination, and connection lifecycle management.

Supported platforms: macOS, Linux, and Windows.

## Install

### Codex

```bash
codex mcp add rs232 -- npx github:xnetcat/rs232-mcp
```

### Claude Code

```bash
claude mcp add rs232 -- npx github:xnetcat/rs232-mcp
```

To add it to a specific project instead of globally:

```bash
claude mcp add --scope project rs232 -- npx github:xnetcat/rs232-mcp
```

### Manual configuration

For any stdio MCP client, configure the server command like this:

```json
{
  "mcpServers": {
    "rs232": {
      "command": "npx",
      "args": ["github:xnetcat/rs232-mcp"]
    }
  }
}
```

If your Windows client does not resolve npm shims correctly, use `npx.cmd` as the command instead of `npx`.

## Tools

| Tool | Description |
|------|-------------|
| `list_ports` | List available serial ports on the system |
| `open_port` | Open a serial connection (path, baudRate, dataBits, stopBits, parity) |
| `close_port` | Close an open serial connection |
| `send_command` | Send a command and wait for Cisco prompt. Handles `-- More --` pagination automatically |
| `write_raw` | Write raw string data to a port (no prompt waiting) |
| `read_buffer` | Read buffered data from a port (non-blocking) |
| `get_connections` | List all open connections and their settings |

## Example usage

Once configured, your AI assistant can:

```
> List serial ports
> Open /dev/tty.usbserial-110 at 9600 baud
> Open COM3 at 9600 baud
> Send "show version"
> Send "show running-config"
> Close the port
```

The `send_command` tool automatically:
- Sends the command with CRLF
- Waits for a Cisco prompt (`Router#`, `Switch>`, `Router(config)#`, etc.)
- Presses space through `-- More --` prompts
- Strips the echoed command from output
- Returns clean output

## Default serial settings

| Parameter | Default |
|-----------|---------|
| Baud rate | 9600 |
| Data bits | 8 |
| Stop bits | 1 |
| Parity | none |

## Windows notes

- Serial ports usually appear as `COM3`, `COM4`, `COM10`, and similar names.
- `list_ports` returns the identifier to use with `open_port`, so you usually do not need any path conversion.
- The runtime uses the `serialport` package directly, so Windows port handling follows the native `COMx` behavior provided by that library.

## Development

```bash
git clone https://github.com/xnetcat/rs232-mcp.git
cd rs232-mcp
npm install
npm run build
npm test
```

## License

MIT
