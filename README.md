# rs232-mcp

MCP server for RS232 serial communication with Cisco network equipment.

Lets AI assistants interact with Cisco routers and switches over serial console connections. Handles prompt detection, `-- More --` pagination, and connection lifecycle management.

## Install

### Claude Code

```bash
claude mcp add rs232 -- npx github:xnetcat/rs232-mcp
```

To add it to a specific project instead of globally:

```bash
claude mcp add --scope project rs232 -- npx github:xnetcat/rs232-mcp
```

### Manual configuration

Add to your Claude Code settings (`~/.claude.json` for global, `.mcp.json` for project):

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
