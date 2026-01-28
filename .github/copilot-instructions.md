# Copilot Instructions

## Project Overview

React 19 + Vite + TypeScript SPA for browsing SOVD (Service-Oriented Vehicle Diagnostics) entity trees from ros2_medkit gateway. The UI provides an entity browser for exploring ROS 2 diagnostics data exposed via the SOVD REST API.

## Architecture

```
src/
├── components/          # React components
│   ├── ui/             # shadcn/ui primitives (Button, Card, Dialog, etc.)
│   ├── EntityTreeSidebar.tsx    # Main navigation tree
│   ├── EntityDetailPanel.tsx    # Entity details view
│   ├── OperationsPanel.tsx      # ROS 2 service/action invocation
│   └── ConfigurationPanel.tsx   # ROS 2 parameter management
├── lib/
│   ├── sovd-api.ts     # Typed HTTP client for gateway REST API
│   ├── store.ts        # Zustand state management
│   ├── types.ts        # TypeScript interfaces for API types
│   ├── schema-utils.ts # JSON Schema utilities
│   └── utils.ts        # Utility functions
└── test/
    └── setup.ts        # Vitest setup
```

## Key Patterns

### State Management (Zustand)

```typescript
// src/lib/store.ts
export const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            // Connection state
            serverUrl: 'http://localhost:8080',
            // Entity tree
            entities: [],
            selectedEntityPath: null,
            // Actions
            selectEntity: (path) => set({ selectedEntityPath: path }),
        }),
        { name: 'sovd-ui-storage' }
    )
);
```

### API Client

```typescript
// src/lib/sovd-api.ts
export class SovdApiClient {
    constructor(private baseUrl: string) {}

    async getComponents(): Promise<Component[]> {
        const response = await fetch(`${this.baseUrl}/api/v1/components`);
        return response.json();
    }
}
```

## Conventions

- Use Zustand for client state
- All API types defined in `lib/types.ts`
- Use `@/` path alias for imports from src
- Prefer composition over inheritance
- Use shadcn/ui components from `components/ui/`
- Format with Prettier (automatic via husky pre-commit)

## Testing

- Unit tests: `*.test.ts` next to source files
- Integration tests: `src/test/integration/`
- Use `@testing-library/react` for component tests
- Run tests: `npm test`

## Gateway API Reference

Default base URL: `http://localhost:8080/api/v1`

| Method | Endpoint                                 | Description                          |
| ------ | ---------------------------------------- | ------------------------------------ |
| GET    | `/areas`                                 | List all areas (namespace groupings) |
| GET    | `/components`                            | List all components                  |
| GET    | `/apps`                                  | List all apps (ROS 2 nodes)          |
| GET    | `/components/{id}/data`                  | List data topics for component       |
| GET    | `/components/{id}/operations`            | List operations (services/actions)   |
| GET    | `/components/{id}/configurations`        | List configurations (parameters)     |
| POST   | `/components/{id}/operations/{name}`     | Call operation                       |
| PUT    | `/components/{id}/configurations/{name}` | Update configuration                 |

## Important Notes

- This UI connects to `ros2_medkit_gateway` running on port 8080
- Entity IDs are alphanumeric + underscore + hyphen only
- Virtual folders (data/, operations/, configurations/) are UI constructs, not API entities
