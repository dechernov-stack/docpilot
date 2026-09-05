import { expect, test } from '@playwright/test';

test('инженерский тур: полнота → baseline → render → review guard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Концепция эксплуатации насосной станции' })).toBeVisible();
  await expect(page.getByText('SRR: 3/4 раздела')).toBeVisible();

  await page.getByRole('button', { name: 'MCR' }).click();
  await expect(page.getByText('MCR: полный')).toBeVisible();
  await page.getByRole('button', { name: 'SRR' }).click();
  await expect(page.getByText(/Нужно: ещё 1 сценария/)).toBeVisible();

  await page.getByText(/Нужно: ещё 1 сценария/).click();
  await expect(page.getByRole('heading', { name: 'Добавить элемент' })).toBeVisible();
  await page.getByPlaceholder('Новый сценарий…').fill('Восстановление после аварии');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByText('Сущность создана — теперь добавьте её в документ')).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить элемент' }).click();
  await expect(page.getByText('SRR: полный')).toBeVisible();

  await page.getByRole('button', { name: 'Базирования' }).click();
  await page.getByRole('button', { name: 'Базировать' }).click();
  await expect(page.getByRole('row', { name: /BL-MCR-1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Рендеринг' }).click();
  await page.getByRole('button', { name: 'Сгенерировать', exact: true }).click();
  await expect(page.getByText('STUB').first()).toBeVisible();

  await page.locator('.role-select select').selectOption('rev');
  await page.getByRole('button', { name: 'Рецензировать' }).click();
  const sectionFour = page.locator('.render-section').filter({ hasText: 'Среда и ограничения' });
  const editor = sectionFour.locator('textarea');
  await editor.fill((await editor.inputValue()).replace('120', '90'));
  await sectionFour.getByRole('button', { name: 'Сохранить раздел' }).click();
  await expect(page.getByText('Правка меняет смысл или трассируемость')).toBeVisible();
});
