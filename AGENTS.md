# AI Agent Instructions

This document provides quick reference for AI coding agents working on the SOVD Web UI project.

## Quick Commands

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run dev`           | Start development server (port 5173) |
| `npm run build`         | Build for production                 |
| `npm test`              | Run tests with Vitest                |
| `npm run test:ui`       | Run tests with Vitest UI             |
| `npm run test:coverage` | Run tests with coverage report       |
| `npm run lint`          | Run ESLint                           |
| `npm run format`        | Format code with Prettier            |
| `npm run format:check`  | Check formatting without writing     |
| `npm run typecheck`     | Run TypeScript type checking         |

## Project Overview

React 19 + Vite + TypeScript SPA for browsing SOVD entity trees from ros2_medkit gateway.

## Important Files

| File                      | Purpose                                |
| ------------------------- | -------------------------------------- |
| `src/lib/sovd-api.ts`     | Typed HTTP client for gateway REST API |
| `src/lib/store.ts`        | Zustand state management               |
| `src/lib/types.ts`        | TypeScript interfaces for API types    |
| `src/lib/schema-utils.ts` | JSON Schema utilities                  |
| `src/components/`         | React components                       |
| `src/components/ui/`      | shadcn/ui primitives                   |

## Gateway API

- **Base URL**: `http://localhost:8080/api/v1`
- **Key endpoints**:
    - `GET /areas` - List areas
    - `GET /components` - List components
    - `GET /apps` - List apps
    - `GET /components/{id}/data` - Component data topics
    - `GET /components/{id}/operations` - Component operations
    - `GET /components/{id}/configurations` - Component configurations

## Architecture Patterns

1. **State Management**: Zustand with persist middleware
2. **API Layer**: Custom `SovdApiClient` class with typed methods
3. **Component Structure**: Feature-based organization
4. **Styling**: Tailwind CSS 4 + shadcn/ui components

## Testing

- Tests are co-located with source files: `*.test.ts` / `*.test.tsx`
- Integration tests: `src/test/integration/`
- Use `@testing-library/react` for component tests
- Use `vitest` for unit tests

## Conventions

- Use TypeScript strict mode
- Prefer interfaces over types
- Use `@/` path alias for imports from src
- Format with Prettier before commit (automatic via husky)
