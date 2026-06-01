import { test, expect } from '@playwright/test';

test.describe('Upload page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/upload');
  });

  test('page loads with correct title and description', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /上传课程素材/ })).toBeVisible();
    await expect(page.getByText(/AI 会自动切片/)).toBeVisible();
  });

  test('video dropzone accepts file selection', async ({ page }) => {
    const dropzone = page.locator('[class*="border-dashed"]').first();
    await expect(dropzone).toBeVisible();

    // Simulate file upload via hidden input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake mp4 content'),
    });

    // Should show selected file name
    await expect(page.getByText('test-video.mp4')).toBeVisible();
  });

  test('submit button disabled without video', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /开始自动化处理/ });
    await expect(submitBtn).toBeDisabled();
  });

  test('granularity selector has 3 options', async ({ page }) => {
    // The granularity selector should show 3 options
    await expect(page.getByText(/粗放概览/)).toBeVisible();
    await expect(page.getByText(/平衡/)).toBeVisible();
    await expect(page.getByText(/精细拆解/)).toBeVisible();
  });

  test('subtitle and slides slots are present', async ({ page }) => {
    await expect(page.getByText(/上传字幕/)).toBeVisible();
    await expect(page.getByText(/PPT 原稿/)).toBeVisible();
  });
});
