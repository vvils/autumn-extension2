---
allowed-tools: mcp__sequential-thinking__sequentialthinking, Bash, Read, Glob, Grep, Write, Edit, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__search_for_pattern, mcp__plugin_serena_serena__read_file, mcp__plugin_serena_serena__list_dir, mcp__plugin_serena_serena__find_file
description: Adapt all agents to match the detected tech stack of the current codebase
---

# Adapt Agents Command

Analyze the current codebase to detect its tech stack, then update all agent files to match.

## Instructions

Use `mcp__sequential-thinking__sequentialthinking` throughout this process to ensure thorough, accurate analysis.

### Phase 1: Tech Stack Detection

Deeply analyze the codebase to detect:

#### 1. Read package.json
- Identify the framework (Next.js, React, Vue, Nuxt, Svelte, Express, Fastify, etc.)
- Identify test runner (bun:test, jest, vitest, mocha, playwright)
- Identify ORM/database (drizzle-orm, @prisma/client, sequelize, typeorm, mongoose)
- Identify validation library (zod, yup, joi, io-ts, valibot)
- Identify API approach (next/server routes, trpc, graphql, express routes)
- Identify linter/formatter (biome, eslint, prettier)
- Identify package manager from lockfile (bun.lockb, package-lock.json, yarn.lock, pnpm-lock.yaml)

#### 2. Scan Configuration Files
Look for and read these files to confirm stack:
- `next.config.ts` / `next.config.js` / `next.config.mjs`
- `vite.config.ts` / `vite.config.js`
- `drizzle.config.ts`
- `prisma/schema.prisma`
- `tsconfig.json`
- `biome.json` / `.eslintrc.*` / `.prettierrc`
- `jest.config.*` / `vitest.config.*`
- `bun.lockb` / `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`

#### 3. Analyze Directory Structure
- Identify routing pattern (`app/` vs `pages/` vs `src/routes/` vs custom)
- Identify component location patterns
- Identify API route patterns
- Identify test file patterns (`.test.ts`, `.spec.ts`, `__tests__/`)

### Phase 2: Create Tech Stack Summary

After detection, create a summary object with:

```
Detected Tech Stack:
- Framework: [detected framework]
- Test Runner: [detected test runner]
- ORM/Database: [detected ORM]
- Validation: [detected validation library]
- API Style: [detected API approach]
- Linter: [detected linter/formatter]
- Package Manager: [detected package manager]
- Routing: [detected routing pattern]
```

### Phase 3: Update Agent Files

Read each agent file from `.claude/agents/` and update tech-stack-specific content:

#### api-docs.md
Replace:
- Framework references (Next.js → detected framework)
- API route patterns to match detected routing style
- Validation library references (Zod → detected library)
- File path examples to match project structure

#### test-driven-development.md
Replace:
- Test runner references (Bun test → detected runner)
- Import statements for test utilities
- Test command examples (`bun test` → detected command)
- Framework-specific testing patterns
- Validation library references

#### serena-explorer.md
Replace:
- Framework references and patterns
- ORM/database references (Drizzle → detected ORM)
- Directory structure references (`app/` → detected routing)
- Schema location references

#### architecture-docs.md
Replace:
- Framework references
- ORM/database references and schema patterns
- Directory structure patterns
- Route handler patterns
- Configuration file references

### Phase 4: Output Summary

After updating, output:

```
## Agent Adaptation Summary

### Detected Tech Stack
| Category | Detected |
|----------|----------|
| Framework | [value] |
| Test Runner | [value] |
| ORM/Database | [value] |
| Validation | [value] |
| API Style | [value] |
| Linter | [value] |
| Package Manager | [value] |

### Files Updated
- `.claude/agents/api-docs.md` - Updated [list changes]
- `.claude/agents/test-driven-development.md` - Updated [list changes]
- `.claude/agents/serena-explorer.md` - Updated [list changes]
- `.claude/agents/architecture-docs.md` - Updated [list changes]

### Manual Review Recommended
[List any areas that may need human verification]
```

## Important Notes

- If a technology cannot be detected, preserve the original agent content for that section and note it in the summary
- Preserve the overall structure and quality standards in each agent
- Only change tech-stack-specific references, not general best practices
- If the codebase already matches the agent defaults (Next.js, Bun, Drizzle, Zod), report "Agents already adapted to current stack" and make no changes
- Use sequential thinking to reason through ambiguous cases (e.g., project has both Jest and Vitest configs)
