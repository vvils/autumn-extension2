---
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion, mcp__sequential-thinking__sequentialthinking, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__search_for_pattern, mcp__plugin_serena_serena__read_file
description: Merge a pull request to main with interactive conflict resolution
---

# Pull Request Merge Command

Merge a pull request to main branch with interactive conflict resolution using deep code analysis when needed.

## Arguments

- `$ARGUMENTS` (optional): The pull request number to merge (e.g., `123`). If not provided, uses your most recent open PR.

## Instructions

### Step 1: Determine PR Number

1. If `$ARGUMENTS` is provided and is a valid number, use it as the PR number
2. If `$ARGUMENTS` is empty or not provided:
   a. Run `gh pr list --author @me --limit 1 --state open --json number,title` to get your most recent open PR
   b. If no open PRs found, tell user: "No open PRs found for your account. Usage: `/prm <pr-number>`" and stop
   c. Extract the PR number and display: "Using your most recent PR: #[number] - [title]"
3. Store the PR number for use throughout the command

### Step 2: Fetch PR Information

1. Run `gh pr view $ARGUMENTS --json number,title,headRefName,baseRefName,state,mergeable` to get PR details
2. If the PR doesn't exist, tell the user and stop
3. If the PR is already merged or closed, tell the user and stop
4. Display the PR title, source branch, and target branch to the user

### Step 3: Check Repository State

1. Run `git status --porcelain` to check for uncommitted changes
2. If there are uncommitted changes, ask the user:
   - "You have uncommitted changes. What would you like to do?"
   - Options: "Stash changes and continue", "Abort merge"
3. If user chooses to stash, run `git stash push -m "prm: stashed before merging PR #$ARGUMENTS"`

### Step 4: Update Local Branches

1. Run `git fetch origin` to get latest remote state
2. Run `git checkout main && git pull origin main` to update main
3. Get the PR's head branch name from step 2

### Step 5: Attempt Merge

1. Run `git merge origin/<head-branch-name> --no-commit --no-ff` to attempt merge without committing
2. Check the exit code and look for conflicts

### Step 6: Handle Merge Result

**If merge succeeds (no conflicts):**
1. Run `git commit -m "Merge PR #$ARGUMENTS: <pr-title>"`
2. Ask user: "Merge successful locally. Push to remote?"
   - Options: "Yes, push to main", "No, abort and reset"
3. If yes: `git push origin main`
4. After successful push, close the PR: `gh pr close $ARGUMENTS --comment "Merged manually to main"`
5. Tell user "PR #$ARGUMENTS has been merged to main successfully"

**If merge has conflicts:**

#### Step 6a: Analyze Conflicts with Serena

For each conflicting file, use Serena to understand the code:

1. Use `mcp__plugin_serena_serena__get_symbols_overview` to understand what symbols/functions are in the conflicting file
2. Use `mcp__plugin_serena_serena__find_referencing_symbols` to see where the conflicting code is used
3. Use `mcp__plugin_serena_serena__search_for_pattern` to find similar patterns elsewhere that might inform the resolution

#### Step 6b: Sequential Thinking for Each Conflict

Use `mcp__sequential-thinking__sequentialthinking` to analyze each conflict:

1. **Understand both versions**
   - What does main's version do?
   - What does the PR's version do?
   - Why did they diverge?

2. **Assess the impact**
   - What functionality would be lost/gained with each choice?
   - Are there dependencies on this code elsewhere?
   - Could keeping one version break something?

3. **Determine the best resolution**
   - Should we keep main's version?
   - Should we keep PR's version?
   - Do we need a manual merge combining both?
   - Is there a third approach that's better?

4. **Identify risks**
   - What could go wrong with this resolution?
   - Are there tests that cover this code?
   - Should we add any safeguards?

#### Step 6c: Interactive Resolution

1. Run `git diff --name-only --diff-filter=U` to list conflicting files
2. Display: "The following files have merge conflicts:"
3. For each conflicting file:
   a. Show the file path
   b. Present the Serena analysis: "This file contains [symbols]. It's referenced by [X places]."
   c. Run `git diff --diff-filter=U <file>` to show the conflict markers
   d. Present the sequential thinking analysis with a recommendation
   e. Ask user using AskUserQuestion:
      - "How would you like to resolve conflicts in `<filename>`?"
      - Options:
        - "Keep our version (main)" - Use `git checkout --ours <file>`
        - "Keep their version (PR branch)" - Use `git checkout --theirs <file>`
        - "Manual resolution needed" - Tell user to edit the file manually, then wait for confirmation
        - "Show me the analysis again" - Re-display the sequential thinking analysis
4. After each file is resolved, run `git add <file>`
5. After all conflicts resolved, run `git diff --name-only --diff-filter=U` to verify no remaining conflicts
6. If conflicts remain, repeat from step 6c
7. Once all resolved:
   a. Run `git commit -m "Merge PR #$ARGUMENTS: <pr-title>"`
   b. Ask user: "All conflicts resolved. Push to remote?"
   c. If yes: `git push origin main`
   d. Close the PR: `gh pr close $ARGUMENTS --comment "Merged manually to main with conflict resolution"`

### Step 7: Cleanup

1. If changes were stashed in step 3, ask user: "Would you like to restore your stashed changes?"
   - If yes: `git stash pop`
2. Run `git status` to show final state

## Error Handling

- If any git command fails unexpectedly, show the error and run `git merge --abort` to reset state
- If user chooses to abort at any point, run `git merge --abort` and `git checkout` back to original branch
- Always inform the user of what's happening at each step

## Important

- Never force push to main
- Always confirm with user before pushing
- **Use Serena to understand conflicting code** before asking user to make decisions
- **Use sequential thinking to provide informed recommendations** for each conflict
- Show clear diffs when conflicts occur so user can make informed decisions
- The PR is closed (not merged via GitHub) because we're doing a manual merge locally
