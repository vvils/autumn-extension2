# Exploration Rules

## Prefer Serena MCP Tools

When exploring the codebase, **always prefer Serena MCP tools** over native exploration tools (Glob, Grep, Read).

### Serena Tools to Use

- `mcp__plugin_serena_serena__get_symbols_overview` - Get high-level view of exports, functions, and types in a file
- `mcp__plugin_serena_serena__find_symbol` - Search by symbol name (functions, classes, types)
- `mcp__plugin_serena_serena__find_referencing_symbols` - Find all references to a symbol
- `mcp__plugin_serena_serena__search_for_pattern` - Regex search when symbol names are unknown
- `mcp__plugin_serena_serena__list_dir` - List files and directories
- `mcp__plugin_serena_serena__find_file` - Find files matching patterns
- `mcp__plugin_serena_serena__read_file` - Read file contents

### Why Serena Over Native Tools

Serena provides **semantic code understanding** rather than text-based search:
- Understands code structure, not just text patterns
- Finds symbol definitions and references accurately
- Traces dependencies and relationships between code elements
- Provides context-aware results

### When to Use Native Tools

Only fall back to native tools (Glob, Grep, Read) when:
- Serena tools are unavailable
- Searching for non-code content (config files, documentation)
- Simple file existence checks
- Reading files after Serena has identified them

### Prefer deep-explorer Agent

For non-trivial exploration tasks, prefer launching the `deep-explorer` agent over manual exploration. It:
- Runs multiple serena-explorer agents in parallel
- Provides breadth through different exploration focuses
- Cross-verifies findings for accuracy
- Returns comprehensive, structured results
