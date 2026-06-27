---
purpose: UI/UX principles, design tokens, and accessibility standards
type: shared
category: design
project: Sagewright
---

# Design Guidelines

## Responsive Design

- Mobile-first approach
- Breakpoints: 320px, 768px, 1024px, 1440px
- Touch targets: minimum 44px
- Use CSS Grid and Flexbox for layouts

## Design Tokens

- Spacing scale: 4, 8, 16, 24, 32, 48px
- Typography scale: 12, 14, 16, 20, 24, 32, 48px
- Use semantic color names (success, warning, error, info)
- Support dark/light mode via CSS custom properties

## Accessibility (WCAG 2.1)

- Semantic HTML as the foundation
- Full keyboard navigation support
- ARIA labels for interactive elements
- Minimum contrast: 4.5:1 (normal text), 3:1 (large text)
- Alt text for all meaningful images
- Focus management for modals and dynamic content

## Component Patterns

- Prefer established component libraries over custom implementations
- Keep components composable and self-contained
- Design tokens should be the single source of truth for visual properties
