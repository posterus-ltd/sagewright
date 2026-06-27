---
purpose: Entrypoint file for OpenAI Codex CLI — references shared alignment files
type: entrypoint
agent: OpenAI Codex CLI
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

## Codex-Specific

- This file supports hierarchical loading: add AGENTS.md files in subdirectories for scoped instructions
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
