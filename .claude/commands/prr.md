---
allowed-tools: Bash, Read, Glob, Grep, Write, mcp__sequential-thinking__sequentialthinking, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__search_for_pattern, mcp__plugin_serena_serena__read_file
description: Analyze PR reviews and create an action plan to address feedback
---

# Pull Request Review Analyzer

Analyze all reviews and comments on a pull request using deep sequential thinking and semantic code exploration, then create a structured plan to address the feedback.

## Arguments

- `$ARGUMENTS` (optional): The pull request number to analyze (e.g., `123`). If not provided, uses your most recent open PR.

## Instructions

### Step 1: Determine PR Number

1. If `$ARGUMENTS` is provided and is a valid number, use it as the PR number
2. If `$ARGUMENTS` is empty or not provided:
   a. Run `gh pr list --author @me --limit 1 --state open --json number,title` to get your most recent open PR
   b. If no open PRs found, tell user: "No open PRs found for your account. Usage: `/prr <pr-number>`" and stop
   c. Extract the PR number and display: "Using your most recent PR: #[number] - [title]"
3. Store the PR number for use throughout the command

### Step 2: Fetch PR Data

Run these commands to gather all review data:

1. Get PR overview:
   ```bash
   gh pr view $ARGUMENTS --json number,title,body,author,state,baseRefName,headRefName,files,reviewDecision
   ```

2. Get all reviews (overall review submissions):
   ```bash
   gh pr view $ARGUMENTS --json reviews
   ```

3. Get PR comments (general discussion):
   ```bash
   gh pr view $ARGUMENTS --json comments
   ```

4. Get inline review comments (line-specific feedback) using the API:
   ```bash
   gh api repos/:owner/:repo/pulls/$ARGUMENTS/comments
   ```

5. If PR doesn't exist or has an error, inform user and stop

### Step 3: Deep Code Exploration with Serena

For each file with review comments, use Serena tools to understand the code context:

1. **Get file overview**: Use `mcp__plugin_serena_serena__get_symbols_overview` on each affected file to understand its structure (exports, functions, types)

2. **Trace symbol references**: For comments about specific functions or types:
   - Use `mcp__plugin_serena_serena__find_symbol` to locate the exact definition
   - Use `mcp__plugin_serena_serena__find_referencing_symbols` to understand how the code is used elsewhere

3. **Search for patterns**: If a reviewer mentions a pattern or convention:
   - Use `mcp__plugin_serena_serena__search_for_pattern` to find similar patterns in the codebase
   - This helps determine if the feedback aligns with existing conventions

4. **Read relevant context**: Use `mcp__plugin_serena_serena__read_file` to read surrounding code and understand the full context of each comment

### Step 4: Sequential Thinking Analysis

Use `mcp__sequential-thinking__sequentialthinking` to deeply analyze each piece of feedback:

**For each review comment, think through:**

1. **Understanding the feedback**
   - What is the reviewer actually asking for?
   - Is this about correctness, style, performance, or maintainability?
   - What's the underlying concern?

2. **Evaluating validity**
   - Is the technical claim accurate?
   - Does the codebase have established patterns that support or contradict this?
   - What do the Serena exploration results tell us about existing conventions?

3. **Assessing impact**
   - What would change if we implement this feedback?
   - Are there ripple effects to other parts of the code?
   - Could this introduce new issues?

4. **Determining action**
   - Should this be addressed, discussed, or acknowledged?
   - What's the specific code change needed?
   - Is there a simpler alternative that achieves the same goal?

**Continue sequential thinking until you've thoroughly analyzed each feedback item.**

### Step 5: Categorize Feedback

Based on the sequential thinking analysis, categorize each item:

**Categories:**
- **Must Address**: Valid technical concerns, bugs, security issues, correctness problems
- **Should Address**: Good suggestions that improve code quality, align with patterns
- **Consider**: Stylistic preferences, optional improvements, low-priority items
- **Discuss**: Disagreements that need conversation, unclear requirements
- **Acknowledged**: Positive feedback or approvals (no action needed)

### Step 6: Generate the Review Response Plan

Create a markdown document with this structure:

```markdown
# PR Review Response Plan - PR #[number]

**PR Title:** [title]
**Author:** [author]
**Review Decision:** [APPROVED/CHANGES_REQUESTED/etc]
**Total Feedback Items:** [count]

---

## Summary

[Brief overview of the feedback themes and overall assessment]

---

## Code Context Discovered

[Key findings from Serena exploration that inform the analysis:]
- [Pattern X is used consistently across the codebase]
- [Function Y is referenced in N places]
- [Similar code in Z follows this convention]

---

## Action Items

### Must Address (X items)

#### 1. [Brief description]
- **Reviewer:** [name]
- **File:** [path:line] (if applicable)
- **Feedback:** [quote or summary]
- **Code Context:** [What Serena exploration revealed about this code]
- **Analysis:** [Deep thinking on why this needs addressing]
- **Action:** [Specific steps to resolve]

### Should Address (X items)
[Same format]

### Consider (X items)
[Same format]

### Discuss (X items)
[Same format - include suggested talking points]

### Acknowledged (X items)
[Brief list of positive feedback/approvals]

---

## Implementation Order

1. [First item to address and why]
2. [Second item...]
3. [etc.]

```

### Step 7: Output the Plan

1. Display the complete plan to the user
2. Optionally write to a file if the plan is large: `pr-review-plan-$ARGUMENTS.md`

## Important

- **Use sequential thinking for complex feedback** - Don't rush analysis; think through implications
- **Use Serena to verify claims** - If a reviewer says "this pattern is used elsewhere", verify it
- Be objective in analysis - don't dismiss valid feedback
- Consider the reviewer's perspective and expertise
- If feedback contradicts established patterns in the codebase, note the evidence
- Prioritize security and correctness concerns over style
- Group related feedback that can be addressed together
- Be specific about what code changes are needed
