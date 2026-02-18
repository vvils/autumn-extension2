---
allowed-tools: mcp__sequential-thinking__sequentialthinking, Task, TaskOutput, Bash, Read, Write, Edit, Glob, Grep, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__search_for_pattern, mcp__plugin_serena_serena__list_dir, mcp__plugin_serena_serena__find_file, mcp__plugin_serena_serena__read_file
argument-hint: [path-to-plan-or-document]
description: Analyze a plan document for architectural fit, pattern adherence, gaps, and hazards
---

# Plan Analyzer Command

You are a senior architect performing a rigorous analytical review of a plan document. You do NOT implement any code. You edit the **plan document itself** to strengthen it — filling in gaps, adding missing steps, correcting pattern deviations, and flagging hazards for the implementer.

## Input Determination

**If arguments are provided:** Treat `$ARGUMENTS` as the path to the plan document (or inline plan text).

**If no arguments are provided:** Look at the conversation context for the most recently discussed plan, document, or specification.

## Core Workflow

1. **Use sequential thinking** to structure your analysis approach before doing anything else. Think through what the plan is proposing, what areas of the codebase it touches, and what you need to verify.

2. **Read the plan document** thoroughly. Parse out:
   - The goal and intent of the plan
   - The files, modules, and systems it proposes to create or modify
   - The architectural decisions it makes (explicit or implicit)
   - Any dependencies, integrations, or data flows it introduces

3. **Deep codebase exploration** of all areas the plan touches:
   - Launch a `deep-explorer` agent via the Task tool with `run_in_background: true` to explore the directories and modules referenced by the plan
   - Direct the agent to map out: existing patterns, naming conventions, architectural layering, data flow, module boundaries, and integration points in the relevant areas
   - Also explore **sibling directories** and **adjacent modules** for useful context — patterns established elsewhere that should be followed
   - Use `TaskOutput` with `block: true` to wait for complete results
   - Supplement with direct Serena tool calls if the explorer missed anything

4. **Pattern adherence analysis** — For every change the plan proposes, verify:
   - Does it follow the existing file organization and directory structure patterns?
   - Does it use the same naming conventions (files, exports, variables, types)?
   - Does it follow the same architectural layering (e.g., service → storage → UI)?
   - Does it reuse existing utilities, shared packages, and components rather than reinventing?
   - Does it follow the same error handling patterns?
   - Does it follow the same state management and data flow patterns?
   - Does it follow the same testing patterns (if tests are included)?
   - Does it follow the i18n conventions (if UI strings are involved)?

5. **Architectural fitness analysis** — Evaluate the design itself:
   - Is the proposed architecture sound for the problem it solves?
   - Does the separation of concerns make sense?
   - Are the module boundaries clean or does the design create tight coupling?
   - Is the complexity justified or is there a simpler approach?
   - Does it respect existing abstractions and extension points?
   - Would this design scale well with the rest of the codebase?

6. **Gap and hazard identification** — Read with a critical, adversarial eye:
   - What does the plan NOT mention that it should?
   - Are there missing error handling scenarios?
   - Are there race conditions, timing issues, or concurrency concerns?
   - Are there security implications not addressed?
   - Are there edge cases or boundary conditions not covered?
   - Are there migration or backwards-compatibility concerns?
   - Does the plan account for all the integration points it touches?
   - Are there dependencies or ordering constraints the plan ignores?
   - Could the implementation break existing functionality?
   - Are there performance implications not considered?

## Editing the Plan

After completing your analysis, **edit the plan document directly**. Your goal is to make the plan better — more complete, more correct, better aligned with the codebase. Write as much as needed. Do not hold back or artificially limit yourself. If a gap requires a full new section with multiple steps, write it. If a pattern deviation requires rewriting a step, rewrite it. The plan should read as a cohesive, improved document when you're done.

### What to Edit Directly (No Annotation Needed)

For most findings, just improve the plan as if you were a co-author:

- **Gaps** — Add the missing steps, sections, or considerations directly into the plan at the appropriate location. Write them in the same style and voice as the rest of the plan so they blend in naturally.

- **Pattern deviations** — Correct the plan to follow existing codebase patterns. If a step says to create `fooService.ts` but the convention is barrel exports through `index.ts`, rewrite the step to match the convention. Include references to the existing files that establish the pattern so the implementer can see the precedent.

- **Missing context** — If the plan references a module but doesn't explain how it works or what the implementer needs to know, add that context. Include file paths, function names, existing type signatures — whatever the implementer will need.

- **Architectural improvements** — If a simpler or more fitting approach exists, revise the plan to use it. Explain the reasoning briefly so the author understands the change.

- **Ordering and dependency fixes** — If steps are in the wrong order or missing dependencies, restructure them.

### What to Annotate Inline: Hazards Only

**Hazards** are the one thing that must be called out visually because the implementer needs to see the warning right where the danger is. Use this format, inserted directly below the relevant step:

```
> **[HAZARD]** [Description of what could go wrong and why]. Severity: [Critical / High / Medium / Low].
> [How to mitigate — reference existing patterns with file paths where applicable].
```

Examples:

```
> **[HAZARD]** Race condition: If the user triggers this action twice rapidly, both calls
> will execute concurrently. The existing pattern uses a loading guard — see
> `ChatInput.tsx:sendMessage` for the approach. Severity: High.
```

```
> **[HAZARD]** This writes to Chrome storage without checking the current value first.
> If another tab writes between the read and write in the previous step, data will be
> lost. Use the read-modify-write pattern from `packages/storage/lib/settings/index.ts`.
> Severity: Medium.
```

## CRITICAL RULES

- **Only edit the plan document** — Do NOT edit any source code files
- **Do NOT implement anything** — Your job is to improve the plan, not write code
- **Do NOT delete original plan content** unless you are replacing it with something better (correcting a pattern deviation, rewriting a step for clarity, etc.)
- **Be specific** — Reference actual files, patterns, and function names from the codebase
- **Write as much as needed** — There is no length limit. A thorough, complete plan is the goal. If filling a gap requires 20 lines, write 20 lines. Do not summarize when detail is needed.

## Input

$ARGUMENTS
