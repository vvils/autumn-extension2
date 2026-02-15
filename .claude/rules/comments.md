# Comment Rules

## The Best Comment is No Comment

Code should be self-documenting. If you need a comment, first try to make the code clearer.

## When NOT to Comment

**Do not add comments for:**

- Obvious code that any developer can understand
- Trivial operations (incrementing counters, basic conditionals)
- Code that follows standard patterns
- Function names that already describe what they do
- Variable assignments where the name explains the value
- Standard library or framework usage

**Bad examples:**
```typescript
// Increment the counter
counter++;

// Check if user is logged in
if (user.isLoggedIn) { ... }

// Get all users from database
const users = await db.query.users.findMany();

// Return the result
return result;
```

## When to Comment

**Add comments only for:**

- Complex algorithms that aren't immediately obvious
- Non-obvious business logic or domain rules
- Workarounds for bugs or limitations (with issue links if available)
- Performance optimizations that sacrifice readability
- Regex patterns that aren't self-explanatory
- "Why" something is done a certain way (not "what")
- Warnings about non-obvious consequences
- Legal or licensing requirements

**Good examples:**
```typescript
// Binary search requires sorted input - caller must ensure this
function binarySearch(sortedArray: number[], target: number) { ... }

// Stripe requires amount in cents, not dollars
const amountInCents = dollars * 100;

// Workaround for Chrome bug #12345 - remove after Chrome 120
element.style.transform = 'translateZ(0)';

// O(n log n) - using merge sort for stable ordering of equal elements
function stableSort(items: Item[]) { ... }
```

## Prefer Better Code Over Comments

Instead of commenting unclear code, improve the code:

| Instead of... | Do this... |
|---------------|------------|
| `// Check if valid` before complex condition | Extract to `isValid()` function |
| `// Process the data` before loop | Name the function `processData()` |
| `// User's age in years` for variable | Name it `userAgeInYears` |
| `// This handles edge case X` | Extract edge case to named function |

## Never Add These Comments

- Commented-out code (delete it, use version control)
- Change logs or author attribution (use git)
- TODO without context or ticket reference
- Redundant JSDoc that restates the function name
- Section dividers (`// ========= HELPERS =========`)
- Closing brace comments (`} // end if`)
