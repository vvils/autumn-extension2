---
allowed-tools: mcp__sequential-thinking__sequentialthinking, Task, Bash, Read, Glob, Grep, Write, Edit, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__search_for_pattern, mcp__plugin_serena_serena__list_dir, mcp__plugin_serena_serena__find_file, mcp__plugin_serena_serena__read_file
argument-hint: [optional: specific file or feature to test]
description: Create high-quality behavior tests for recently implemented features
---

# Test Creation Command

Create focused, high-quality tests for recently implemented features. Tests should verify **behavior**, not implementation details.

## Core Philosophy

> "Write tests that would still pass if you completely rewrote the implementation."

**Quality over quantity.** A few excellent tests beat many mediocre ones.

## Instructions

### 1. Identify What to Test

Use sequential thinking to analyze what was recently implemented:

**If no argument provided:**
- Run `git diff HEAD~1` to see the most recent commit changes
- Run `git diff` to see any uncommitted changes
- Run `git log --oneline -5` to understand recent work context

**If argument provided ($ARGUMENTS):**
- Locate the specified file or feature
- Use Serena tools to understand its structure and dependencies

### 2. Analyze the Feature

Use Serena tools to understand:
- What the code **does** (its observable behavior)
- What inputs it accepts
- What outputs it produces
- What side effects it has (database, API calls, state changes)
- What error conditions it handles

**Critical:** Focus on the public interface and observable outcomes, NOT internal implementation.

### 3. Determine Essential Test Cases

Apply the **Critical Path Analysis**:

1. **Happy Path (Required)** - The main success scenario that provides core value
2. **Primary Edge Cases (1-2 max)** - Only the most likely failure modes users will encounter
3. **Error Boundaries (1-2 max)** - Only errors that would cause data loss, security issues, or system failure

**Skip these:**
- Trivial validation (framework handles it)
- Implementation details (private methods, internal state)
- Unlikely edge cases (cosmic ray bit flips)
- Tests that duplicate framework guarantees

### 4. Write High-Quality Tests

Each test must follow these principles:

**Test Behavior, Not Implementation:**
```typescript
// BAD - Tests implementation
test("calls validateEmail internally", () => {
  const spy = spyOn(service, "validateEmail");
  service.createUser({ email: "test@example.com" });
  expect(spy).toHaveBeenCalled();
});

// GOOD - Tests behavior
test("rejects invalid email format", () => {
  const result = service.createUser({ email: "not-an-email" });
  expect(result.success).toBe(false);
  expect(result.error).toContain("email");
});
```

**One Concept Per Test:**
```typescript
// BAD - Multiple concepts
test("user creation", () => {
  // Tests validation AND creation AND response format...
});

// GOOD - Single concept
test("creates user with valid data", () => { ... });
test("rejects user with duplicate email", () => { ... });
```

**Clear Arrange-Act-Assert:**
```typescript
test("returns user profile for authenticated request", async () => {
  // Arrange
  const user = await createTestUser({ name: "Alice" });
  const request = authenticatedRequest(user.id);

  // Act
  const response = await GET(request);

  // Assert
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.name).toBe("Alice");
});
```

**Intention-Revealing Names:**
```typescript
// BAD
test("test1", () => { ... });
test("handles error", () => { ... });

// GOOD
test("returns 404 when user does not exist", () => { ... });
test("preserves existing data when partial update fails", () => { ... });
```

### 5. Test File Location and Structure

Place tests alongside source files or in `__tests__` directory following project conventions.

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

describe("FeatureName", () => {
  // Setup if needed
  beforeAll(async () => { /* ... */ });
  afterAll(async () => { /* ... */ });

  describe("primary behavior", () => {
    test("succeeds with valid input", async () => { /* ... */ });
  });

  describe("error handling", () => {
    test("returns appropriate error for invalid input", async () => { /* ... */ });
  });
});
```

### 6. Verify Tests

After writing tests:
- Run `bun test [test-file]` to verify they pass
- Intentionally break the implementation to verify tests fail appropriately
- Ensure test failure messages are clear and actionable

## What NOT to Test

- **Framework behavior** - Don't test that Next.js routing works
- **Third-party libraries** - Don't test that Zod validates correctly
- **Getters/setters** - Don't test trivial property access
- **Private methods** - Test through public interface only
- **Configuration** - Don't test that config values are set
- **Types** - TypeScript already validates these at compile time

## Output Format

After creating tests, provide:

```
## Tests Created

**Feature:** [What was tested]
**Test File:** [Path to test file]

### Test Cases
1. [Test name] - [What it verifies]
2. [Test name] - [What it verifies]

### Coverage Focus
- [Primary behavior covered]
- [Key edge case covered]

### Run Command
bun test [path/to/test/file]
```

## Quality Checklist

Before finishing, verify each test:
- [ ] Tests observable behavior, not implementation
- [ ] Would pass if implementation was rewritten
- [ ] Has a clear, descriptive name
- [ ] Tests one concept only
- [ ] Fails with a helpful message when behavior breaks
- [ ] Runs fast (milliseconds, not seconds)
