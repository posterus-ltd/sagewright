---
purpose: System architecture, module boundaries, and data flow
type: shared
category: engineering
project: Sagewright
---

# Architecture

## Folder Structure

```
<!-- Document your project's folder structure here -->
src/
  features/       # Feature-based modules
  shared/         # Shared utilities and components
  infrastructure/ # External service integrations
  config/         # Configuration files
```

## Module Boundaries

- Each feature module should be self-contained
- Cross-module communication through well-defined interfaces
- Shared code goes in dedicated shared modules
- No circular dependencies between modules

## Data Flow

- Unidirectional data flow where possible
- Clear separation between data fetching and presentation
- State management strategy: [document your choice]

## Dependency Rules

- Features depend on shared, never on other features directly
- Infrastructure is injected, not imported directly
- External APIs are wrapped in adapters
