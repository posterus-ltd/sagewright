---
purpose: Entrypoint file for Claude Code — references shared alignment files
type: entrypoint
agent: Claude Code
auto_loaded: true
location: Project root + nested dirs
philosophy: Move Fast
team_size: solo
autonomy: balanced
project: Sagewright
---

# Sagewright — AI Agent Alignment

## Project

See alignment/VISION.md for product vision: roadmap context, user personas, goals, metrics.

## Engineering

See alignment/SWE.md for software engineering principles: solid, clean code, tdd, error handling.
See alignment/CONVENTIONS.md for code style: naming, file organization, import ordering, patterns.
See alignment/ARCHITECTURE.md for system architecture: folder structure, module boundaries, data flow.

## Design

See alignment/DESIGN.md for ui/ux guidelines: design tokens, responsive design, accessibility.

## Stack

See alignment/TECHSTACK.md for technology stack: frameworks, languages, versions, and rationale.

## Agent Behavior

- Make straightforward changes directly; ask for guidance on ambiguous decisions
- Small refactors within the scope of the task are acceptable
- When multiple valid approaches exist, briefly explain the trade-offs and recommend one
- Create new files when the task clearly requires it, but ask before restructuring

## Claude-Specific

- This file supports hierarchical loading: add CLAUDE.md files in subdirectories for scoped instructions
- Sub-directory files are loaded when you operate in that scope

## Collaborative Alignment

You have access to the alignment files that guide your behavior in this project.
When you discover gaps, inconsistencies, or improvements during development:

1. **Propose, never modify** — Never change alignment files without explicit human approval
2. **Present as a diff** — Show the exact change you'd make and explain the rationale
3. **Focus on real gaps** — Only propose changes based on actual development experience, not hypothetical improvements
4. **One change at a time** — Keep proposals focused and easy to review
5. **Wait for approval** — The human must explicitly agree before any alignment file is modified

Example proposal format:
```
ALIGNMENT IMPROVEMENT PROPOSAL
File: alignment/SWE.md
Section: Error Handling
Reason: Discovered that our API consistently uses Result types but this isn't documented

+ ## Error Handling Pattern
+ Use Result<T, E> types for all service-layer functions.
+ Reserve exceptions for truly exceptional conditions.
```


<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax


<!-- nx configuration end-->