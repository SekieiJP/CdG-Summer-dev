import { expect, test } from '@playwright/test';

test('夏期講習編の全体フローモックを確認できる', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/夏期講習編 フローモック/);
  await expect(page.getByRole('heading', { name: 'カードで学習塾 夏期講習編' })).toBeVisible();
  await expect(page.locator('.turn-button')).toHaveCount(13);
  await expect(page.locator('#phaseOverlay')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#menuOverlay')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.choice-button')).toHaveCount(4);
  await expect(page.locator('#handGrid .hand-slot')).toHaveCount(4);
  await expect(page.locator('#handGrid .hand-slot.new-card')).toHaveCount(1);

  await page.locator('#summaryToggle').click();
  await expect(page.locator('#phaseOverlay')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#phaseName')).toHaveText('研修フェーズ');
  await page.locator('[data-close="#phaseOverlay"]').click();
  await expect(page.locator('#phaseOverlay')).toHaveAttribute('aria-hidden', 'true');

  await page.locator('#menuToggle').click();
  await expect(page.locator('#menuOverlay')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('.deck-column')).toHaveCount(4);
  await expect(page.locator('#scheduleList .schedule-item')).toHaveCount(13);
  await page.locator('[data-close="#menuOverlay"]').click();
  await expect(page.locator('#menuOverlay')).toHaveAttribute('aria-hidden', 'true');

  await page.locator('button.turn-button[data-turn="8"]').click();
  await page.locator('button.phase-tab[data-phase="1"]').click();
  await expect(page.locator('#turnPill')).toHaveText('中期2日目');
  await expect(page.locator('#phasePill')).toHaveText('教室会議');
  await page.locator('#summaryToggle').click();
  await expect(page.locator('#phaseDescription')).toContainText('SSRも復活');
  await page.locator('[data-close="#phaseOverlay"]').click();

  await page.locator('button.turn-button[data-turn="12"]').click();
  await page.locator('button.phase-tab[data-phase="2"]').click();
  await page.locator('#summaryToggle').click();
  await expect(page.locator('#phaseName')).toHaveText('結果画面');
  await expect(page.locator('#phaseDescription')).toContainText('rank CSV');
});

test('縦画面では4人スタッフが2列2行で表示される', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.locator('button.phase-tab[data-phase="1"]').click();

  const slots = page.locator('.staff-slot');
  await expect(slots).toHaveCount(4);

  const boxes = await Promise.all([0, 1, 2, 3].map(async (index) => slots.nth(index).boundingBox()));
  const [first, second, third] = boxes;

  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(third).not.toBeNull();

  expect(Math.abs(first.y - second.y)).toBeLessThan(20);
  expect(third.y).toBeGreaterThan(first.y + 40);
});
