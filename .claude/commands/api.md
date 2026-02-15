---
allowed-tools: Bash, Read, Glob, Grep, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__search_for_pattern, mcp__plugin_serena_serena__list_dir, mcp__plugin_serena_serena__find_file, mcp__plugin_serena_serena__read_file
argument-hint: [optional: path/to/endpoints or feature-name]
description: Document request/response structure for newly implemented API endpoints
---

# API Documentation Command

Generate documentation for newly implemented API endpoints for frontend engineers.

## Instructions

1. **Find the endpoints to document:**
   - If arguments provided, focus on those specific files/features
   - Otherwise, find recently changed API routes:
     - Run `git diff --name-only staging..HEAD` (or `main..HEAD`)
     - Filter for files in `app/api/`, `pages/api/`, or `src/app/api/`
   - If not in git context, ask user which endpoints to document

2. **For each endpoint, extract from the code:**
   - HTTP method and route path
   - Request body type (from Zod schema or TypeScript interface)
   - Response type
   - Query parameters (from searchParams usage)
   - Any enums or union types used

3. **Use Serena tools** to find types and schemas in the codebase

## Output Format

For each endpoint:

```
### METHOD /api/path/[param]

[One sentence describing what this endpoint does]

**Request Body:**
```typescript
{
  name: string;
  status: "active" | "inactive" | "pending";
  count?: number;
}
```

**Query Params:** `?page=1&limit=10&filter=active`
- `page` (number) - Page number
- `limit` (number) - Items per page
- `filter` (StatusEnum) - Filter by status

**Response:**
```typescript
{
  id: string;
  name: string;
  status: "active" | "inactive" | "pending";
  createdAt: string;
}
```

**Enums:**
- `StatusEnum`: `"active"` | `"inactive"` | `"pending"`
```

## Rules

- Extract actual types from code - don't guess
- Keep it concise - frontend engineers just need the structure
- Include enums inline with the types and list them separately
- Omit sections that don't apply (no query params? skip that section)
