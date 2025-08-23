# Context Browser Test Suite

## Overview

This test suite provides comprehensive coverage for the Context Browser components using a hybrid testing approach combining unit tests, integration tests, and end-to-end tests.

## Test Structure

```
__tests__/
├── unit/                     # Unit tests (React Testing Library)
│   ├── components/
│   │   ├── contexts/
│   │   │   └── ContextFilters.test.tsx    # Filter state & Clear All bug
│   │   └── projects/
│   │       └── ProjectSwitcher.test.tsx   # Dropdown width bug
│   ├── stores/
│   │   └── contextStore.test.tsx          # Zustand state management
│   └── pages/
├── integration/              # Integration tests
│   └── context-browser.test.tsx           # Full workflow testing
├── playwright/               # E2E tests
│   ├── context-browser.spec.ts            # Browser automation
│   ├── global-setup.ts
│   └── global-teardown.ts
├── fixtures/                 # Test data
│   ├── contexts.ts
│   ├── projects.ts
│   └── searchParams.ts
└── utils/                    # Test utilities
    ├── test-utils.tsx        # Custom render with providers
    ├── mocks.ts              # API mocks and helpers
    └── helpers.ts
```

## Key Bug Tests

### 1. Clear All Button State Synchronization
**File**: `unit/components/contexts/ContextFilters.test.tsx`
**Bug**: Clear All button doesn't properly sync with filter state
**Tests**:
- Button disabled when no filters active
- Button enabled when filters applied
- All filters cleared when clicked
- Local search query reset
- State synchronization verified

### 2. Dropdown Width/Functionality
**File**: `unit/components/projects/ProjectSwitcher.test.tsx`
**Bug**: Dropdown width issues in constrained containers
**Tests**:
- Dropdown renders properly in narrow containers
- Search functionality works within dropdown
- Long project names handled gracefully
- Options remain selectable

## Running Tests

### Unit & Integration Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test ContextFilters.test.tsx

# Run in CI mode
npm run test:ci
```

### E2E Tests (Playwright)
```bash
# Install browsers
npm run playwright:install

# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run headed (see browser)
npm run test:e2e:headed

# Debug tests
npm run test:e2e:debug
```

## Test Data Management

### Fixtures
All test data is centralized in the `fixtures/` directory:
- `contexts.ts` - Mock context objects and search results
- `projects.ts` - Mock project data
- `searchParams.ts` - Various search parameter combinations

### Mocks
API mocks are defined in `utils/mocks.ts`:
- Context API responses
- Project API responses
- Error scenarios
- Loading states

## Coverage Requirements

The test suite maintains minimum coverage thresholds:
- **Lines**: 70%
- **Functions**: 70% 
- **Branches**: 70%
- **Statements**: 70%

## Testing Principles

### 1. Test Behavior, Not Implementation
Tests focus on user interactions and expected outcomes rather than internal implementation details.

### 2. Use Real DOM Events
Tests use `userEvent` for realistic user interactions rather than synthetic events.

### 3. Mock External Dependencies
All API calls and external services are mocked for consistent, fast tests.

### 4. Test Error Scenarios
Each component is tested for both success and failure cases.

### 5. Accessibility Testing
Tests include keyboard navigation and ARIA label verification.

## Common Patterns

### Testing Async State Changes
```typescript
await waitFor(() => {
  expect(mockApi.searchContexts).toHaveBeenCalledWith(expectedParams);
});
```

### Testing Debounced Inputs
```typescript
const timers = mockTimers();
await user.type(searchInput, 'query');
timers.advanceTime(300); // Debounce delay
expect(mockUpdateSearchParam).toHaveBeenCalled();
timers.cleanup();
```

### Testing State Management
```typescript
act(() => {
  result.current.clearFilters();
});
expect(result.current.searchParams).toEqual(defaultSearchParams);
```

## Debugging Tests

### Failed Tests
1. Check mock setup in `beforeEach`
2. Verify test data in fixtures
3. Use `screen.debug()` to see DOM state
4. Add `waitFor` for async operations

### E2E Test Debugging
1. Run with `--headed` to see browser
2. Use `--debug` for step-by-step debugging  
3. Check network tab for API calls
4. Verify test data setup

## Continuous Integration

Tests run automatically on:
- Pull requests
- Main branch pushes
- Scheduled runs (nightly)

CI configuration includes:
- Multiple browser testing (Chrome, Firefox, Safari)
- Mobile device testing
- Coverage reporting
- Performance benchmarks

## Contributing

When adding new features:

1. **Unit tests** for component logic
2. **Integration tests** for component interactions
3. **E2E tests** for critical user flows
4. **Update fixtures** with new test data as needed
5. **Maintain coverage** above thresholds

When fixing bugs:

1. **Write failing test** that reproduces the bug
2. **Fix the implementation** 
3. **Verify test passes**
4. **Add edge case tests** to prevent regression
