import { expect, test } from '@playwright/test';

test('夏期 game の初期フローを確認できる', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/夏期講習編/);
  await expect(page.getByRole('heading', { name: 'カードで学習塾 夏期講習編' })).toBeVisible();
  await expect(page.locator('#startOverlay')).toBeVisible();
  await page.locator('#startGame').click();
  await expect(page.locator('#turnTimeline .turn-chip')).toHaveCount(13);
  await expect(page.locator('#trainingChoices .choice-button')).toHaveCount(4);
  await expect(page.locator('#handGrid .hand-slot')).toHaveCount(4);

  await page.locator('#trainingChoices [data-category="動員"]').click();
  await page.locator('#trainingChoices [data-category="教務"]').click();
  await page.locator('#trainingChoices [data-category="応対"]').click();
  await page.locator('#trainingChoices [data-category="庶務"]').click();

  await expect(page.locator('#actionArea')).not.toHaveClass(/hidden/);
  await expect(page.locator('#actionArea select[data-hand-index]')).toHaveCount(4);

  const selects = page.locator('#actionArea select[data-hand-index]');
  const used = new Set();
  for (let index = 0; index < 4; index += 1) {
    const select = selects.nth(index);
    const options = await select.evaluate((element) => Array.from(element.options).map((option) => ({
      value: option.value,
      disabled: option.disabled,
    })));
    const nextOption = options.find((option) => option.value && !option.disabled && !used.has(option.value));
    if (nextOption) {
      used.add(nextOption.value);
      await select.selectOption(nextOption.value);
    }
  }

  await expect(page.locator('#actionConfirm')).toBeEnabled();

  await page.locator('#actionConfirm').click();
  await expect(page.locator('#meetingArea')).not.toHaveClass(/hidden/);
  await expect(page.locator('#meetingSummary')).toContainText('配置カード');
  await expect(page.locator('#nPoolSummary')).toContainText('Nプール');

  await page.locator('#meetingConfirm').click();
  await expect(page.locator('#turnPill')).toContainText('第2ターン');
});
