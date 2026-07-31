# Demo

`anchor-protocol.tape` records the README GIF with [VHS](https://github.com/charmbracelet/vhs).

```bash
brew install vhs
npm install -g @thewillmoss/anchor-mcp   # required — see below
vhs demo/anchor-protocol.tape            # writes demo/anchor.gif
```

It drives the server through the official MCP inspector CLI rather than live
agents, so it is deterministic and anyone can reproduce it. Current output:
**17.8s, 237KB**.

`anchor.tape` is the live Claude Code / Codex CLI variant. It is more compelling
and much less reliable — see the notes below.

## Things that cost an afternoon to learn

**The inspector needs a single-token server command.** `--cli npx -y @pkg` makes
it swallow `--method` into `npx`, and you get
`sh: method:initialize: command not found` followed by a 15s timeout. Install the
package globally so the command is just `anchor-mcp`.

**`Set Shell "zsh"`.** VHS defaults to a bash that does not source your shell
config, so `claude`, `codex`, `npx` — anything in `~/.local/bin` or under mise —
is not on `PATH`, and every beat fails with "no such file or directory."

**`Wait /^\$/`, not `Sleep`.** Fixed sleeps have to be sized for the slowest case,
which means long dead air on every faster run. Waiting for the prompt cut this
recording from 50.7s to 17.8s.

**Wait inside `Hide` too.** If a hidden command is still running when the next
line is typed, the input queues and `Show` reveals the whole setup block.

**`setopt interactive_comments`.** zsh does not treat `#` as a comment
interactively, so caption lines otherwise print `command not found: #`.

**ASCII only inside `Type`.** VHS mangles em-dashes to `<0080><0094>`.

**Relative `Output` paths only.** Absolute paths fail to parse in VHS 0.11.

## The live-agent variant

`anchor.tape` runs real `claude -p` and `codex exec`. Before recording it once:

```bash
cd /tmp && rm -rf anchor-demo && mkdir anchor-demo && cd anchor-demo && git init -q
mkdir -p .claude .codex
printf '%s\n' '{"mcpServers":{"anchor":{"command":"npx","args":["-y","@thewillmoss/anchor-mcp"]}}}' > .claude/.mcp.json
printf '%s\n' '[mcp_servers.anchor]' 'command = "npx"' 'args = ["-y", "@thewillmoss/anchor-mcp"]' > .codex/config.toml
claude -p "hello"     # answer the trust prompt — VHS cannot
codex exec "hello"    # answer any first-run prompt
```

VHS cannot answer interactive dialogs. A scripted run gets its keystrokes eaten
by the prompt and the remainder leaks to the shell.

## Checks before publishing a recording

- Review it frame by frame for paths, hostnames, and repo names you don't want public.
- Keep it under ~3MB so it loads quickly in the README.
