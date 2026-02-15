---
allowed-tools: Task, Bash, Read, Glob, Grep, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__list_dir, mcp__plugin_serena_serena__find_file, mcp__plugin_serena_serena__read_file
description: Simplify and refine code changes in the current branch
---

# Simplify Code Command

Invoke the code-simplifier agent to simplify and refine code produced in the current branch.

## Instructions

1. **Determine what to simplify:**
   - Run `git branch --show-current` to get the current branch name
   - Run `git status` to see the current state

2. **Get the changed files:**
   - **If on `staging` or `main` branch:** Target uncommitted changes only
     - Run `git diff --name-only` for unstaged changes
     - Run `git diff --cached --name-only` for staged changes
     - If no uncommitted changes, inform the user "No uncommitted changes to simplify"
   - **If on any other branch:** Target all changes since divergence from staging
     - Run `git merge-base staging HEAD` to find the divergence point
     - Run `git diff --name-only $(git merge-base staging HEAD)..HEAD` to list changed files
     - Filter to only include code files (exclude config, lock files, etc.)

3. **Filter to code files only:**
   - Include: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.cs`, `.rb`
   - Exclude: `package-lock.json`, `yarn.lock`, `*.config.*`, `*.json` (unless explicitly source code)

4. **Get the actual diff content:**
   - Run `git diff $(git merge-base staging HEAD)..HEAD` to get the full diff
   - This gives the code-simplifier context on what was changed

5. **Invoke the code-simplifier agent:**
   Use the Task tool with the following configuration:

   ```
   subagent_type: "code-simplifier"
   description: "Simplify branch code changes"
   prompt: |
     Simplify and refine the code in the following files that were changed in this branch:

     **Branch:** [branch name]
     **Files changed:**
     [list of changed code files]

     **Diff of changes:**
     ```diff
     [full diff output]
     ```

     Focus on the changed code and:
     - Reduce complexity and nesting depth
     - Improve naming for clarity and intent
     - Eliminate any duplication introduced
     - Remove dead code or unused imports
     - Apply clean code principles (DRY, KISS, single responsibility)
     - Ensure consistent formatting with the codebase

     IMPORTANT:
     - Preserve ALL functionality - only change how the code is written, not what it does
     - Focus primarily on the changed lines, but fix obvious issues in surrounding context if needed
     - Do not add features, tests, or documentation unless explicitly broken
   ```

6. **After completion**, provide a summary:
   - List files that were modified
   - Summarize the types of simplifications made
   - Recommend the user review changes before committing

## Output Format

```
## Code Simplification

**Branch:** [branch name]
**Files to simplify:** [count]

[List of files]

---

Invoking code-simplifier agent...

---

## Simplification Complete

**Files modified:** [list]

**Changes made:**
- [Summary of simplifications]

**Next steps:**
- Review the changes with `git diff`
- Run tests to verify functionality is preserved
- Commit when satisfied
```
