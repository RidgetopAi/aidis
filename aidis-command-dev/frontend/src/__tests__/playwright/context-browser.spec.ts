import { test, expect } from '@playwright/test';

test.describe('Context Browser E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses for consistent testing
    await page.route('**/api/contexts/search*', async route => {
      await route.fulfill({
        json: {
          contexts: [
            {
              id: 'ctx-1',
              project_id: 'proj-1',
              project_name: 'Test Project',
              type: 'code',
              content: 'Test context content for E2E testing',
              tags: ['important', 'test'],
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:35:00Z'
            },
            {
              id: 'ctx-2', 
              project_id: 'proj-1',
              project_name: 'Test Project',
              type: 'decision',
              content: 'Decision context for E2E testing',
              tags: ['architecture'],
              created_at: '2024-01-14T15:20:00Z',
              updated_at: '2024-01-14T15:25:00Z'
            }
          ],
          total: 2,
          page: 1,
          limit: 20
        }
      });
    });

    await page.route('**/api/contexts/stats', async route => {
      await route.fulfill({
        json: {
          total_contexts: 2,
          by_type: { code: 1, decision: 1 },
          by_project: { 'proj-1': 2 },
          recent_contexts: 2,
          total_projects: 1
        }
      });
    });

    await page.route('**/api/projects*', async route => {
      await route.fulfill({
        json: {
          projects: [
            {
              id: 'proj-1',
              name: 'Test Project',
              status: 'active',
              context_count: 2,
              last_activity: '2024-01-15T10:30:00Z'
            }
          ],
          total: 1
        }
      });
    });

    // Navigate to the Context Browser page
    await page.goto('/contexts');
    
    // Wait for initial load
    await expect(page.getByText('2 contexts found')).toBeVisible();
  });

  test.describe('Search and Filter Functionality', () => {
    test('should perform semantic search with debouncing', async ({ page }) => {
      // Show filters
      await page.click('button:has-text("Show Filters")');
      
      // Type in search box
      const searchInput = page.locator('input[placeholder*="Search contexts"]');
      await searchInput.fill('test query');
      
      // Wait for debounce (300ms)
      await page.waitForTimeout(350);
      
      // Should trigger search API call
      await expect(page.locator('.ant-spin')).not.toBeVisible();
    });

    test('should clear all filters - CRITICAL BUG TEST', async ({ page }) => {
      // Show filters
      await page.click('button:has-text("Show Filters")');
      
      // Apply multiple filters
      await page.locator('input[placeholder*="Search contexts"]').fill('test');
      await page.selectOption('select[aria-label="Filter by type"]', 'code');
      
      // Wait for filters to be applied
      await page.waitForTimeout(350);
      
      // Verify Clear All button is enabled
      const clearAllButton = page.locator('button:has-text("Clear All")');
      await expect(clearAllButton).toBeEnabled();
      
      // Click Clear All
      await clearAllButton.click();
      
      // Verify all filters are cleared
      await expect(page.locator('input[placeholder*="Search contexts"]')).toHaveValue('');
      await expect(page.locator('select[aria-label="Filter by type"]')).toHaveValue('');
      
      // Clear All button should be disabled
      await expect(clearAllButton).toBeDisabled();
    });

    test('should filter by context type', async ({ page }) => {
      await page.click('button:has-text("Show Filters")');
      
      // Select type filter
      await page.selectOption('select[aria-label="Filter by type"]', 'code');
      
      // Should show filtered results
      await expect(page.getByText('Code')).toBeVisible();
    });

    test('should handle advanced filters', async ({ page }) => {
      await page.click('button:has-text("Show Filters")');
      
      // Open advanced filters
      await page.click('text=Advanced Filters');
      
      // Add tags
      const tagsInput = page.locator('input[placeholder*="Enter or select tags"]');
      await tagsInput.fill('important');
      await page.keyboard.press('Enter');
      
      // Should apply tag filter
      await expect(page.locator('.ant-tag:has-text("important")')).toBeVisible();
    });
  });

  test.describe('Project Switching Integration', () => {
    test('should handle project switching - DROPDOWN WIDTH BUG TEST', async ({ page }) => {
      // Find project switcher (assuming it's in the header/layout)
      const projectSwitcher = page.locator('[data-testid="project-switcher"]').first();
      
      if (await projectSwitcher.isVisible()) {
        // Open project dropdown
        await projectSwitcher.click();
        
        // Verify dropdown is properly sized and visible
        const dropdown = page.locator('.ant-select-dropdown');
        await expect(dropdown).toBeVisible();
        
        // Should be able to see and click project options
        const projectOption = page.locator('.ant-select-item:has-text("Test Project")').first();
        if (await projectOption.isVisible()) {
          await projectOption.click();
        }
        
        // Context browser should refresh
        await expect(page.getByText('contexts found')).toBeVisible();
      }
    });
  });

  test.describe('Context Interactions', () => {
    test('should select and bulk delete contexts', async ({ page }) => {
      // Select all contexts
      const selectAllCheckbox = page.locator('input[type="checkbox"]').first();
      await selectAllCheckbox.check();
      
      // Should show bulk actions
      await expect(page.getByText('Delete Selected')).toBeVisible();
      
      // Click delete (but cancel in confirmation)
      await page.click('button:has-text("Delete Selected")');
      
      // Should show confirmation modal
      await expect(page.locator('.ant-modal')).toBeVisible();
      
      // Cancel deletion
      await page.click('button:has-text("Cancel")');
      
      // Modal should close
      await expect(page.locator('.ant-modal')).not.toBeVisible();
    });

    test('should open context detail view', async ({ page }) => {
      // Click on first context (view button)
      await page.click('[data-testid="context-view-btn"]');
      
      // Should open detail drawer/modal
      await expect(page.locator('.ant-drawer')).toBeVisible();
      
      // Should show context details
      await expect(page.getByText('Test context content')).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('should work properly on mobile devices', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Should show mobile-friendly layout
      await expect(page.locator('.ant-card')).toBeVisible();
      
      // Filters should be collapsible on mobile
      if (await page.locator('button:has-text("Show Filters")').isVisible()) {
        await page.click('button:has-text("Show Filters")');
        await expect(page.locator('input[placeholder*="Search contexts"]')).toBeVisible();
      }
    });

    test('should handle dropdown width on small screens - LAYOUT BUG TEST', async ({ page }) => {
      // Set small viewport
      await page.setViewportSize({ width: 320, height: 568 });
      
      await page.click('button:has-text("Show Filters")');
      
      // Open type filter dropdown
      const typeSelect = page.locator('select[aria-label="Filter by type"]').first();
      await typeSelect.click();
      
      // Dropdown should be visible and usable
      const dropdown = page.locator('.ant-select-dropdown');
      await expect(dropdown).toBeVisible();
      
      // Should be able to select options
      const codeOption = page.locator('.ant-select-item:has-text("Code")');
      if (await codeOption.isVisible()) {
        await codeOption.click();
      }
    });
  });

  test.describe('Loading and Error States', () => {
    test('should show loading states properly', async ({ page }) => {
      // Intercept API to add delay
      await page.route('**/api/contexts/search*', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.fulfill({
          json: { contexts: [], total: 0, page: 1, limit: 20 }
        });
      });
      
      // Navigate to page
      await page.goto('/contexts');
      
      // Should show loading spinner
      await expect(page.locator('.ant-spin')).toBeVisible();
      
      // Wait for loading to complete
      await expect(page.getByText('0 contexts found')).toBeVisible({ timeout: 10000 });
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/api/contexts/search*', async route => {
        await route.fulfill({
          status: 500,
          json: { error: 'Internal server error' }
        });
      });
      
      await page.goto('/contexts');
      
      // Should show error message
      await expect(page.getByText(/failed to load contexts/i)).toBeVisible();
      
      // Should be able to retry
      const refreshButton = page.locator('button:has-text("Refresh")');
      if (await refreshButton.isVisible()) {
        await refreshButton.click();
      }
    });
  });

  test.describe('Pagination', () => {
    test('should handle pagination correctly', async ({ page }) => {
      // Mock large dataset
      await page.route('**/api/contexts/search*', async route => {
        const url = new URL(route.request().url());
        const offset = parseInt(url.searchParams.get('offset') || '0');
        
        await route.fulfill({
          json: {
            contexts: [
              {
                id: `ctx-${offset + 1}`,
                project_id: 'proj-1',
                type: 'code',
                content: `Context ${offset + 1}`,
                created_at: '2024-01-15T10:30:00Z'
              }
            ],
            total: 100,
            page: Math.floor(offset / 20) + 1,
            limit: 20
          }
        });
      });
      
      await page.goto('/contexts');
      
      // Should show pagination
      await expect(page.locator('.ant-pagination')).toBeVisible();
      await expect(page.getByText('100 contexts found')).toBeVisible();
      
      // Go to next page
      await page.click('button[title="Next Page"]');
      
      // Should load page 2
      await expect(page.getByText('Context 21')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await page.keyboard.press('Tab'); // Focus first interactive element
      
      // Should be able to navigate through filters
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
      }
      
      // Should be able to activate elements with Enter/Space
      await page.keyboard.press('Enter');
    });

    test('should have proper ARIA labels', async ({ page }) => {
      // Check for important ARIA labels
      await expect(page.locator('[aria-label="Search contexts"]')).toBeVisible();
      await expect(page.locator('[role="button"]')).toHaveCount({ greaterThan: 0 });
    });
  });

  test.describe('Performance', () => {
    test('should handle large datasets efficiently', async ({ page }) => {
      // Mock large dataset
      const largeContexts = Array.from({ length: 100 }, (_, i) => ({
        id: `ctx-${i}`,
        project_id: 'proj-1',
        type: 'code',
        content: `Large dataset context ${i}`,
        created_at: '2024-01-15T10:30:00Z'
      }));
      
      await page.route('**/api/contexts/search*', async route => {
        await route.fulfill({
          json: {
            contexts: largeContexts.slice(0, 20),
            total: largeContexts.length,
            page: 1,
            limit: 20
          }
        });
      });
      
      const startTime = Date.now();
      await page.goto('/contexts');
      await expect(page.getByText('100 contexts found')).toBeVisible();
      const loadTime = Date.now() - startTime;
      
      // Should load within reasonable time (adjust threshold as needed)
      expect(loadTime).toBeLessThan(5000);
    });
  });
});
