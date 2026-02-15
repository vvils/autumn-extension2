---
allowed-tools: Bash
description: Create and switch to a new git branch
---

# Branch Command

Create a new git branch and switch to it.

## Arguments

$ARGUMENTS = The name of the new branch to create

## Instructions

1. **Validate the branch name:**
   - If no argument provided, inform the user: "Please provide a branch name: /b <branch-name>"
   - Branch name should not contain spaces or special characters that git doesn't allow

2. **Create and switch to the branch:**
   - Run `git checkout -b $ARGUMENTS`

3. **Confirm success:**
   - Report the new branch name
   - Show the current status with `git status`
