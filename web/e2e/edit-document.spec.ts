import { test, expect } from '@playwright/test';

test.describe('Edit document page', () => {
  test('page loads for non-existent document', async ({ page }) => {
    await page.goto('/documents/fake-doc-id/edit');
    // Should show some content (loading or error)
    await expect(page.locator('body')).toContainText(/加载|文档/, { timeout: 10000 });
  });
});

test.describe('Report document page', () => {
  test('page loads for non-existent document', async ({ page }) => {
    await page.goto('/documents/fake-doc-id/report');
    await expect(page.locator('body')).toContainText(/加载|文档/, { timeout: 10000 });
  });
});
