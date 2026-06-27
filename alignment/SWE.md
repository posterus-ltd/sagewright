---
purpose: Core engineering principles and practices
type: shared
category: engineering
philosophy: Move Fast
project: Sagewright
---

# Software Engineering Principles

## Philosophy

Bias toward shipping. Prefer working code over perfect abstractions. Refactor when patterns emerge, not upfront.

## SOLID Principles

- **Single Responsibility**: Each module/class has one reason to change
- **Open/Closed**: Open for extension, closed for modification
- **Liskov Substitution**: Subtypes must be substitutable for their base types
- **Interface Segregation**: No client should depend on interfaces it doesn't use
- **Dependency Inversion**: Depend on abstractions, not concretions

## Clean Code

- Use intention-revealing, searchable names
- Keep functions small (<20 lines) with a single purpose
- Limit function parameters to 0-3
- Comments explain "why", never "what"
- Remove dead code — don't comment it out

## Error Handling

- Fail fast: validate inputs at system boundaries
- Use language-appropriate error patterns (Result types, exceptions, error codes)
- Never swallow errors silently
- Provide actionable error messages

## Code Review

Keep reviews lightweight. Focus on correctness and security, not style.
You are the sole developer. Maintain a decision log for context when revisiting code.
