import { expect, test } from '@playwright/test';

test('夏期講習編の全体フローモックを確認できる', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/夏期講習編 フローモック/);
  await expect(page.getByRole('heading', { name: 'カードで学習塾 夏期講習編' })).toBeVisible();
  await expect(page.locator('.turn-button')).toHaveCount(13);
  await expect(page.locator('.deck-column')).toHaveCount(4);
  await expect(page.locator('#phaseName')).toHaveText('研修フェーズ');

  await page.locator('button.turn-button[data-turn="8"]').click();
  await page.locator('button.phase-tab[data-phase="1"]').click();
  await expect(page.locator('#turnPill')).toHaveText('中期2日目');
  await expect(page.locator('#phasePill')).toHaveText('教室会議');
  await expect(page.locator('#phaseDescription')).toContainText('SSRも復活');

  await page.locator('button.turn-button[data-turn="12"]').click();
  await page.locator('button.phase-tab[data-phase="2"]').click();
  await expect(page.locator('#phaseName')).toHaveText('結果画面');
  await expect(page.locator('#phaseDescription')).toContainText('rank CSV');
});
