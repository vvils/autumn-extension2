---
allowed-tools: mcp__sequential-thinking__sequentialthinking, Task, Bash, Read, Glob, Grep, AskUserQuestion, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__search_for_pattern, mcp__plugin_serena_serena__list_dir, mcp__plugin_serena_serena__find_file, mcp__plugin_serena_serena__read_file
description: Deep code review of branch changes since divergence from staging
---

# Code Review Command

Perform a thorough code review of changes in the current branch.

## Instructions

1. **Use sequential thinking** to plan and execute the code review systematically

2. **Determine what to review:**
   - Run `git branch --show-current` to get the current branch name
   - Run `git status` to see the current state

3. **Get the changes to review:**
   - **If on `staging` or `main` branch:** Review uncommitted changes only
     - Run `git diff` for unstaged changes
     - Run `git diff --cached` for staged changes
     - If no uncommitted changes, inform the user "No uncommitted changes to review"
   - **If on any other branch:** Review all changes since divergence from staging
     - Run `git merge-base staging HEAD` to find the divergence point
     - Run `git diff $(git merge-base staging HEAD)..HEAD` to see all changes
     - Run `git log --oneline $(git merge-base staging HEAD)..HEAD` to see commits

4. **Analyze the changed files using Serena tools (preferred):**
   - **Always prefer Serena tools over Glob/Grep/Read for code exploration**
   - Use `get_symbols_overview` to understand file structure and exports
   - Use `find_symbol` to locate functions, classes, and types by name
   - Use `find_referencing_symbols` to check impact of changes on the rest of the codebase
   - Use `search_for_pattern` for regex searches when symbol names are unknown
   - Use `read_file` (Serena) to examine full file context when needed
   - Only fall back to native Read/Glob/Grep when Serena tools are unavailable

5. **Perform code review checking for:**

   **Clean Code Violations:**
   - Functions that are too long or do multiple things
   - Poor naming (unclear variables, functions, classes)
   - Magic numbers without named constants
   - Excessive comments that could be replaced by clearer code
   - DRY violations (duplicated code)
   - Dead code or unused imports

   **Security Issues:**
   - SQL injection vulnerabilities
   - XSS vulnerabilities
   - Command injection
   - Hardcoded secrets or credentials
   - Improper input validation
   - Missing authentication/authorization checks

   **Error Handling:**
   - Missing try-catch blocks where needed
   - Swallowed errors without proper handling
   - Unclear error messages
   - Missing null/undefined checks

   **Performance Concerns:**
   - N+1 query problems
   - Unnecessary re-renders in React
   - Missing memoization where beneficial
   - Inefficient algorithms or data structures

   **Code Quality:**
   - Type safety issues (TypeScript)
   - Inconsistent patterns with rest of codebase
   - Missing or inadequate tests
   - Unclear control flow

6. **Generate review report:**
   - Summarize the scope of changes
   - **Identify the Top 3 Worst Issues** - The most critical problems that need immediate attention
   - List Critical and Major issues only (skip minor issues and suggestions)
   - For each issue, provide:
     - File and line reference
     - Description of the problem
     - Suggested fix
   - Provide an overall assessment
   - **Generate a Fix Plan** for the top 3 issues with actionable implementation steps

## Output Format

```
## Code Review Summary

**Branch:** [branch name]
**Changes Reviewed:** [description of scope]
**Files Changed:** [count]

---

## 🚨 Top 3 Worst Issues

**These are the most critical problems requiring immediate attention:**

### 1. [Issue Title]
- **File:** [file:line]
- **Problem:** [Clear description of the issue]
- **Impact:** [Why this is critical]
- **Resolution:**
```
[Code example or specific steps to fix]
```

### 2. [Issue Title]
[Same format as above]

### 3. [Issue Title]
[Same format as above]

---

## Critical Issues
[Issues that must be fixed before merge]

## Major Issues
[Significant problems that should be addressed]

---

## Overall Assessment
[Summary of code quality, risk level, and merge recommendation]

---

## Fix Plan for Top 3 Issues

### Issue 1: [Title]
**Steps to fix:**
1. [Specific action with file reference]
2. [Next step]
3. [Verification step]

**Code changes required:**
```
[Specific code to add/modify/remove]
```

### Issue 2: [Title]
**Steps to fix:**
1. [Specific action with file reference]
2. [Next step]
3. [Verification step]

**Code changes required:**
```
[Specific code to add/modify/remove]
```

### Issue 3: [Title]
**Steps to fix:**
1. [Specific action with file reference]
2. [Next step]
3. [Verification step]

**Code changes required:**
```
[Specific code to add/modify/remove]
```
```

## Code Simplification (Post-Review)

7. **After presenting the review**, ask the user if they want to run the code-simplifier agent to automatically fix clean code issues.

8. **If user agrees**, invoke the code-simplifier agent using the Task tool:
   - Use `subagent_type: "code-simplifier"`
   - Pass the list of files with clean code violations
   - The agent will simplify and refine the code while preserving functionality

**Prompt for code-simplifier:**
```
Simplify and refine the following files that were flagged in code review:

Files: [list of files with clean code issues]

Issues to address:
- [List the clean code violations found]

Focus on:
- Reducing complexity and nesting
- Improving naming clarity
- Eliminating duplication
- Removing dead code
- Applying project coding standards

Preserve all functionality - only change how the code is written, not what it does.
```

9. **After code-simplifier completes**, summarize what was changed and recommend the user review the modifications before committing.
