import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/教学视频/);
  });

  test('dashboard shows sidebar with 工作台', async ({ page }) => {
    await page.goto('/');
    // The sidebar nav should contain 工作台
    await expect(page.locator('nav').first()).toContainText('工作台');
  });

  test('navigation to upload page works', async ({ page }) => {
    await page.goto('/');
    const uploadLink = page.getByRole('link', { name: /上传任务/ });
    await expect(uploadLink).toBeVisible();
    await uploadLink.click();
    await expect(page).toHaveURL(/\/upload/);
  });
});
