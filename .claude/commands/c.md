---
allowed-tools: Bash, Read, Edit, Glob, Grep
description: Remove trivial comments and debugging logs from branch changes
---

# Clean Command

Remove trivial comments and debugging statements from code changed in the current branch.

## Instructions

1. **Determine what to clean:**
   - Run `git branch --show-current` to get the current branch name
   - Run `git status` to see the current state

2. **Get the changed files:**
   - **If on `staging` or `main` branch:** Target uncommitted changes only
     - Run `git diff --name-only` and `git diff --cached --name-only`
     - If no uncommitted changes, inform the user "No uncommitted changes to clean"
   - **If on any other branch:** Target all changes since divergence from staging
     - Run `git diff --name-only $(git merge-base staging HEAD)..HEAD`

3. **Filter to code files only:**
   - Include: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.cs`, `.rb`

4. **For each changed file, remove:**

   **Trivial Comments:**
   - Comments that restate what the code obviously does
   - Commented-out code
   - Empty comments or placeholder comments
   - Section dividers (`// ========`, `# ----`, etc.)
   - Closing brace comments (`} // end if`, `} // end function`)
   - Redundant JSDoc that just restates the function name

   **Debugging Statements:**
   - `console.log`, `console.debug`, `console.info`, `console.warn` (keep `console.error` if it's real error handling)
   - `print()` statements in Python (unless clearly intentional output)
   - `fmt.Println` debug statements in Go
   - `System.out.println` in Java
   - `debugger` statements
   - `TODO` or `FIXME` comments without ticket references

   **Do NOT remove:**
   - Comments explaining complex logic or "why"
   - Comments about workarounds or non-obvious behavior
   - Legitimate logging (error handling, audit logs)
   - Legal/license comments

5. **Read each file and make edits** using the Edit tool to remove the identified items.

6. **Report what was cleaned:**
   - List files modified
   - Summarize what was removed (X comments, Y debug statements)

## Output Format

```
## Clean Complete

**Branch:** [branch name]
**Files cleaned:** [count]

**Removed:**
- [X] trivial comments
- [Y] debugging statements
- [Z] commented-out code blocks

**Files modified:**
- [file1]: removed N items
- [file2]: removed N items

Run `git diff` to review changes.
```
