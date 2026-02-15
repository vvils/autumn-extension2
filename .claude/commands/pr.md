---
allowed-tools: Bash, Read, Glob, Grep
description: Create a pull request for the current branch
---

# Create Pull Request Command

Create a pull request for the current branch against staging (or main if staging doesn't exist).

## Instructions

1. Run `git branch --show-current` to get the current branch name
2. If on `main` or `staging`, tell the user "Cannot create PR from main/staging branch" and stop
3. Check if a PR already exists: `gh pr view --json state 2>/dev/null` - if it exists, show the URL and stop
4. Run `git log --oneline staging..HEAD` (or `main..HEAD`) to see all commits on this branch
5. Run `git diff staging..HEAD --stat` to see changed files summary
6. Ensure the branch is pushed: `git push -u origin HEAD` if needed
7. **Check for PR template** - Look for a template in these locations (in order):
   - `.github/PULL_REQUEST_TEMPLATE.md`
   - `.github/pull_request_template.md`
   - `docs/pull_request_template.md`
   - `PULL_REQUEST_TEMPLATE.md`
8. Analyze the commits and changes to generate:
   - A concise PR title (under 70 characters)
   - A PR body that follows the template structure if one was found, otherwise use the default format
9. Create the PR:

**If PR template exists:** Fill in the template sections based on the actual changes. Replace placeholder text, checkboxes, and prompts with real content.

**If no template:** Use this default format:
```bash
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<bullet points describing what this PR does>

## Changes
<list of key changes>

EOF
)"
```

10. Output the PR URL when done

## Important

- Never include AI attribution or "Co-Authored-By" in PR descriptions
- Keep the title short and descriptive
- Base branch is `staging` if it exists, otherwise `main`
- If there are no commits to create a PR from, inform the user
