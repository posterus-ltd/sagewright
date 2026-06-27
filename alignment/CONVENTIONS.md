---
purpose: Naming, file organization, and code patterns
type: shared
category: engineering
team_size: solo
project: Sagewright
---

# Code Conventions

## Typescript

- Use types and interfaces
- Use enums `enum ExampleEnum {FIRST = 'first', SECOND = 'second'}` instead of `'first' | 'second'`

## React

- use custom hooks to encapsulate business logic
- use PropsWithChildren generics interface
- use const arrow functions as a default for everything
- create React components as arrow functions of type FC by default

## Naming

- Files: kebab-case for utilities, PascalCase for components/classes
- Variables/functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Types/interfaces: PascalCase
- Boolean variables: prefix with is/has/should/can

## File Organization

- Group by feature/domain, not by file type
- Co-locate tests with source files
- Keep index files thin — re-exports only
- One component per file

## Imports

- External packages first, then internal modules, then relative imports
- Separate groups with blank lines
- Prefer named exports over default exports

## Patterns to Follow

- Prefer composition over inheritance
- Use pure functions where possible
- Minimize mutable state
- Keep side effects at the edges of the system

## Anti-Patterns to Avoid

- God objects/files (>300 lines is a smell)
- Deep nesting (>3 levels)
- Magic numbers or strings
- Premature abstraction

## Version Control

Simple branching: main + feature branches. No complex workflows needed.
You are the sole developer. Maintain a decision log for context when revisiting code.
