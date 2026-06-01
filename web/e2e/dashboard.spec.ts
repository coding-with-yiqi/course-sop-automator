import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows stats cards', async ({ page }) => {
    await expect(page.getByText('处理中')).toBeVisible();
    await expect(page.getByText('已完成')).toBeVisible();
    await expect(page.getByText('待导出')).toBeVisible();
  });

  test('shows "新建自动化任务" CTA button', async ({ page }) => {
    const cta = page.getByRole('link', { name: /新建自动化任务/ });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/upload/);
  });

  test('shows empty state or task list', async ({ page }) => {
    // When there are no tasks, should show empty state; otherwise task list
    const bodyText = await page.locator('body').textContent() ?? '';
    const hasContent = bodyText.includes('最近任务') || bodyText.includes('暂无') || bodyText.includes('还没有');
    expect(hasContent).toBe(true);
  });

  test('sidebar navigation links work', async ({ page }) => {
    // Check sidebar has all expected nav items
    await expect(page.getByRole('link', { name: /工作台/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /上传任务/ })).toBeVisible();
  });
});
