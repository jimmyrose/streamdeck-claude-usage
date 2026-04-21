# Stream Deck Claude Usage

Stream Deck plugin that shows your Claude Max usage percentages with colour-coded background.

- **Green**: < 50% usage
- **Amber**: 50-79% usage  
- **Red**: 80%+ usage

Polls every 2 minutes. Press the button to refresh immediately.

## Setup

```bash
cd com.jamesrose.claude-usage.sdPlugin
npm install
npm run build
```

Then symlink the plugin folder into Stream Deck:

```powershell
New-Item -ItemType SymbolicLink -Path "$env:APPDATA\Elgato\StreamDeck\Plugins\com.jamesrose.claude-usage.sdPlugin" -Target "C:\Users\james\workspaces\tools\streamdeck-claude-usage\com.jamesrose.claude-usage.sdPlugin"
```

Restart Stream Deck software, then drag "Claude Usage" action onto a button.

## Requirements

- Claude Code authenticated (token at `~/.claude/.credentials.json`)
- Stream Deck software v6.6+
- Uses undocumented Anthropic usage API
