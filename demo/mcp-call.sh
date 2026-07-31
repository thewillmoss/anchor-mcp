#!/usr/bin/env sh
# Thin wrapper used by the demo tape: call one anchor tool, print just the result.
# Requires `npm install -g @thewillmoss/anchor-mcp` so the server is a single token —
# the MCP inspector CLI mis-parses multi-token server commands like `npx -y <pkg>`.
mcp () {
  tool="$1"; shift
  npx -y @modelcontextprotocol/inspector --cli anchor-mcp \
      --method tools/call --tool-name "$tool" "$@" 2>/dev/null \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["content"][0]["text"])'
}
