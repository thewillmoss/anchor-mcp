# anchor-mcp demo (no agent auth required) — vhs demo/anchor-protocol.tape
#
# Drives the server through the official MCP inspector CLI rather than live
# agents, so the recording is deterministic and anyone can reproduce it.
# See anchor.tape for the live Claude Code / Codex CLI version.
#
# Requires: npm install -g @thewillmoss/anchor-mcp
# The inspector needs a SINGLE-TOKEN server command; `npx -y <pkg>` makes it
# swallow --method into npx and time out.

Require npx
Require anchor-mcp

Output demo/anchor.gif

Set Shell        "zsh"
Set FontSize     17
Set Width        1180
Set Height       560
Set Padding      20
Set Theme        "Catppuccin Mocha"
Set TypingSpeed  22ms
Set WaitTimeout  180s

Hide
Type "setopt interactive_comments" Enter
Type "export PROMPT='$ '" Enter
Type "cd /tmp && rm -rf anchor-demo && mkdir anchor-demo && cd anchor-demo && git init -q" Enter
Wait /^\$/
Type "source ~/dev/anchor-mcp/demo/mcp-call.sh" Enter
Wait /^\$/
Type "mcp task_manager --tool-arg action=list > /dev/null 2>&1" Enter
Wait@300s /^\$/
Type "rm -rf .anchor && clear" Enter
Wait /^\$/
Show

Type "# One agent sets the active task" Enter
Sleep 500ms
Type `mcp task_manager --tool-arg action=set_active --tool-arg "description=migrate auth to the new identity service"` Enter
Wait /^\$/
Sleep 2s
Type "clear" Enter

Type "# It lands as plain JSON. Not in .claude/, not in .codex/" Enter
Sleep 500ms
Type "cat .anchor/state.json" Enter
Wait /^\$/
Sleep 2500ms
Type "clear" Enter

Type "# A separate process. Different tool. Same anchor." Enter
Sleep 500ms
Type "mcp task_manager --tool-arg action=get_active" Enter
Wait /^\$/
Sleep 3s
