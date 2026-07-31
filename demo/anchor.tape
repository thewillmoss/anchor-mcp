# anchor-mcp demo — record with:  vhs demo/anchor.tape
#
# Two things this tape gets right, learned the hard way:
#   Set Shell "zsh"  — VHS's default bash does not source your shell config, so
#                      claude/codex/npx (in ~/.local/bin and mise) are NOT on
#                      PATH and every command fails with "no such file".
#   Wait /^\$/       — waits for the prompt to return instead of sleeping a
#                      fixed time. Fixed sleeps produce long dead air on replay.
#   setopt interactive_comments
#                    — zsh does not treat '#' as a comment interactively, so
#                      caption lines otherwise print "command not found: #".
#   ASCII only in Type
#                    — VHS mangles em-dashes in typed input to <0080><0094>.
#
# BEFORE RECORDING, once: run demo/README.md's prewarm block by hand so the
# agents' first-run prompts are already answered. VHS cannot answer a dialog.

Require claude
Require codex
Require npx

Output demo/anchor.gif

Set Shell         "zsh"
Set FontSize      18
Set Width         1200
Set Height        600
Set Padding       20
Set Theme         "Catppuccin Mocha"
Set TypingSpeed   30ms
Set WaitTimeout   120s

# ── hidden: simple prompt, scratch repo, anchor wired into both agents ──
Hide
Type "setopt interactive_comments" Enter
Type "export PROMPT='$ '" Enter
Type "cd /tmp && rm -rf anchor-demo && mkdir anchor-demo && cd anchor-demo && git init -q" Enter
Type "mkdir -p .claude .codex" Enter
Type `printf '%s\n' '{"mcpServers":{"anchor":{"command":"npx","args":["-y","@thewillmoss/anchor-mcp"]}}}' > .claude/.mcp.json` Enter
Type `printf '%s\n' '[mcp_servers.anchor]' 'command = "npx"' 'args = ["-y", "@thewillmoss/anchor-mcp"]' > .codex/config.toml` Enter
Type "clear" Enter
Show

# ── beat 1: agent A writes state ────────────────────────────────
Type "# Agent A: Claude Code" Enter
Sleep 600ms
Type `claude -p "Set my active task to: migrate auth to the new identity service"` Enter
Wait /^\$/
Sleep 2s
Type "clear" Enter

# ── beat 2: the state is plain files ────────────────────────────
Type "# state lives here, not in .claude/ or .codex/" Enter
Sleep 600ms
Type "cat .anchor/task.json" Enter
Wait /^\$/
Sleep 3s
Type "clear" Enter

# ── beat 3: a different agent reads the same state ──────────────
Type "# Agent B: Codex CLI. Different tool. Same anchor." Enter
Sleep 600ms
Type `codex exec "What is my active task?"` Enter
Wait /^\$/
Sleep 3s
