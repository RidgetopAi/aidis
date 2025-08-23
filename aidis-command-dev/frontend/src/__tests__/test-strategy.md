# Context Browser Test Strategy

## Test Structure & Naming Convention

```
src/
├── __tests__/                    # Main test directory
│   ├── unit/                     # Unit tests
│   │   ├── components/
│   │   │   ├── contexts/
│   │   │   │   ├── ContextFilters.test.tsx
│   │   │   │   ├── ContextCard.test.tsx
│   │   │   │   └── BulkActions.test.tsx
│   │   │   └── projects/
│   │   │       └── ProjectSwitcher.test.tsx
│   │   ├── stores/
│   │   │   └── contextStore.test.tsx
│   │   └── pages/
│   │       └── Contexts.test.tsx
│   ├── integration/              # Integration tests
│   │   ├── context-browser.test.tsx
│   │   └── project-switching.test.tsx
│   ├── fixtures/                 # Test data
│   │   ├── contexts.ts
│   │   ├── projects.ts
│   │   └── searchParams.ts
│   └── utils/                    # Test utilities
│       ├── test-utils.tsx        # Custom render with providers
│       ├── mocks.ts              # API mocks
│       └── helpers.ts            # Test helpers
└── playwright/                   # E2E tests
    ├── context-browser.spec.ts
    ├── project-switching.spec.ts
    └── fixtures/
        └── test-data.json
```

## Unit Test Focus Areas

### 1. ContextFilters.tsx
- **Clear All button state synchronization bug**
- Search query debouncing
- Filter parameter updates
- Active filter counting
- Type/tag/date filtering logic

### 2. contextStore.ts (Zustand)
- State mutations and immutability
- Search parameter management
- Selection state management
- Computed values accuracy
- Filter clearing functionality

### 3. Contexts.tsx (Main Integration)
- Component integration
- Search parameter synchronization
- Pagination logic
- Error handling
- Loading states

### 4. ProjectSwitcher.tsx
- Project loading and filtering
- Selection handling
- Search functionality
- Status display logic

## Integration Test Scenarios

### User Workflow Tests
1. **Search and Filter Flow**
2. **Project Switching with Context Refresh**
3. **Bulk Operations**
4. **Filter State Persistence**

## Known Bug Test Cases

### Clear All Button State Sync Bug
- Test filter state before/after clear
- Verify UI reflects cleared state
- Test multiple filter combinations

### Dropdown Width/Functionality Bug
- Test dropdown rendering in different containers
- Verify all options are selectable
- Test search within dropdown

## Test Data Strategy

### Mock API Responses
- Realistic context data with embeddings
- Project hierarchy with permissions
- Error scenarios (network failures, auth issues)

### Fixture Management
- Reusable test data sets
- Consistent state patterns
- Edge case data (empty states, large datasets)
