# Privacy

carbon-consumption-estimated runs entirely on your own machine. It collects nothing, stores nothing and sends nothing anywhere: it makes no network connections at all.

## What it reads

- **Claude Code's local transcripts**: the `.jsonl` files in `~/.claude/projects` (or `$CLAUDE_CONFIG_DIR/projects`). From each file it uses only, per API response, the model name, the token counts and the timestamp. It does not read, show or keep the content of your conversations.
- **Each model request of the current session**, through Claude Code's plugin API: the model and its token counts, for the status line. The running total is kept in memory for the session only.
- **Settings and environment**: `HOME` or `USERPROFILE` and `CLAUDE_CONFIG_DIR` to find the transcripts, and Claude Code's `language` setting plus `LC_ALL`, `LC_MESSAGES` and `LANG` to pick a language when it is set to `auto`.

## What it runs

- `grep`, only for transcripts larger than 4 MB, to filter them down to the lines that carry token usage before counting. On systems without `grep` those files are skipped.

## What it shows

The estimates appear only in your own Claude Code session: in the status line and in the output of `/carbon`.
