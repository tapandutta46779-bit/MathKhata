import { expect, test } from '@playwright/test';

test('complete local-first notebook flow persists and exports', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.getByTestId('notebook-page')).toBeVisible();
  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible();

  const notebookPage = page.getByTestId('notebook-page');
  const bounds = await notebookPage.boundingBox();
  if (!bounds) throw new Error('Notebook page has no visible bounds');

  await page.getByRole('button', { name: /Math tool/ }).click();
  await page.mouse.click(bounds.x + 150, bounds.y + 145);
  let mathFields = page.locator('math-field.math-editor');
  await expect(mathFields).toHaveCount(1);
  await expect(mathFields.first()).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => mathFields.first().evaluate((field) => document.activeElement === field)).toBe(true);
  await page.keyboard.type('x^2+6x-40=0');
  await expect.poll(() => mathFields.first().evaluate((field: any) => field.value)).toContain('x^2');

  await page.screenshot({ path: 'docs/screenshots/02-math-writing.png' });

  await page.getByRole('button', { name: 'Toggle symbol palette' }).click();
  await expect(page.getByTestId('math-palette')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/03-math-palette.png' });
  await page.getByRole('button', { name: 'Insert Fraction' }).click();
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  await expect
    .poll(() => mathFields.first().evaluate((field: any) => field.value))
    .toMatch(/\\frac\{?1\}?\{?2\}?/);
  await page.getByRole('button', { name: 'Close symbol palette' }).click();

  await page.getByRole('button', { name: /Math tool/ }).click();
  await page.mouse.click(bounds.x + 540, bounds.y + 315);
  mathFields = page.locator('math-field.math-editor');
  await expect(mathFields).toHaveCount(2);
  await expect(mathFields.nth(1)).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => mathFields.nth(1).evaluate((field) => document.activeElement === field)).toBe(true);
  await page.keyboard.type('y=mx+b');

  await page.getByRole('button', { name: /Text tool/ }).click();
  await page.mouse.click(bounds.x + 250, bounds.y + 470);
  const textField = page.getByLabel('Text note');
  await expect(textField).toBeVisible();
  await textField.fill('Check the discriminant before choosing a branch.');

  await mathFields.first().click({ position: { x: 24, y: 28 } });
  const firstObject = page.getByTestId('page-object-math').first();
  const oldLeft = Number.parseFloat((await firstObject.getAttribute('style'))?.match(/left:\s*([\d.]+)px/)?.[1] ?? '0');
  const dragHandle = page.getByRole('button', { name: 'Drag object' });
  const handleBox = await dragHandle.boundingBox();
  if (!handleBox) throw new Error('Drag handle has no visible bounds');
  await page.mouse.move(handleBox.x + 5, handleBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 85, handleBox.y + 55, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => {
    const style = await firstObject.getAttribute('style');
    return Number.parseFloat(style?.match(/left:\s*([\d.]+)px/)?.[1] ?? '0');
  }).toBeGreaterThan(oldLeft + 50);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => {
    const style = await firstObject.getAttribute('style');
    return Number.parseFloat(style?.match(/left:\s*([\d.]+)px/)?.[1] ?? '0');
  }).toBeLessThanOrEqual(oldLeft + 1);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(async () => {
    const style = await firstObject.getAttribute('style');
    return Number.parseFloat(style?.match(/left:\s*([\d.]+)px/)?.[1] ?? '0');
  }).toBeGreaterThan(oldLeft + 50);

  await page.screenshot({ path: 'docs/screenshots/04-spatial-work.png' });

  await page.getByRole('button', { name: '+ Add page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/06-multiple-pages.png' });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete page 2' }).click();
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Open page 1' }).click();
  await expect(page.getByTestId('page-object-math')).toHaveCount(2);

  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId('page-object-math')).toHaveCount(2);
  await expect(page.getByLabel('Text note')).toHaveValue('Check the discriminant before choosing a branch.');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();

  mathFields = page.locator('math-field.math-editor');
  await mathFields.first().click({ position: { x: 24, y: 28 } });
  await expect.poll(() => mathFields.first().evaluate((field) => document.activeElement === field)).toBe(true);
  await page.keyboard.press('End');
  await page.keyboard.type('+1');
  await expect.poll(() => mathFields.first().evaluate((field: any) => field.value)).toContain('+1');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await page.keyboard.press('Meta+KeyZ');
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
  await expect.poll(() => mathFields.first().evaluate((field: any) => field.value)).not.toContain('+1');
  await page.keyboard.press('Meta+Shift+KeyZ');
  await expect.poll(() => mathFields.first().evaluate((field: any) => field.value)).toContain('+1');
  await mathFields.first().click({ position: { x: 24, y: 28 } });
  await expect.poll(() => mathFields.first().evaluate((field) => document.activeElement === field)).toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('page-object-math')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('page-object-math')).toHaveCount(2);

  await page.getByRole('button', { name: 'Notebook menu' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export structured JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mathkhata\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(exported).toMatchObject({ format: 'mathkhata-notebook', schemaVersion: 1 });
  expect(exported.notebook.pages[0].objects).toHaveLength(3);

  await page.setInputFiles('input[aria-label="Import MathKhata JSON"]', {
    name: 'malformed.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"untrusted":"<script>alert(1)</script>"}'),
  });
  await expect(page.getByText(/Import rejected without changing your notebook/)).toBeVisible();
  await expect(page.getByLabel('Notebook title')).toHaveValue('My MathKhata');
});

test('palette inserts structured roots, calculus, and matrices at the MathLive caret', async ({ page }) => {
  await page.goto('/');
  const paper = page.getByTestId('notebook-page');
  const bounds = await paper.boundingBox();
  if (!bounds) throw new Error('Notebook page has no visible bounds');
  await page.getByRole('button', { name: /Math tool/ }).click();
  await page.mouse.click(bounds.x + 180, bounds.y + 180);
  const field = page.locator('math-field.math-editor');
  await expect(field).toHaveCount(1);
  await expect.poll(() => field.evaluate((element) => document.activeElement === element)).toBe(true);

  await page.getByRole('button', { name: 'Toggle symbol palette' }).click();
  await page.getByRole('button', { name: 'Insert Square root' }).click();
  await page.keyboard.type('x+1');
  await page.keyboard.press('Tab');
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('\\sqrt{x+1}');

  await page.getByRole('tab', { name: 'Calculus' }).click();
  await page.getByRole('button', { name: 'Insert Definite integral' }).click();
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('\\int_');

  await page.getByRole('tab', { name: 'Linear algebra' }).click();
  await page.getByRole('button', { name: 'Insert 2 by 2 matrix' }).click();
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('\\begin{pmatrix}');
});

test('renames, creates, and reopens local notebooks', async ({ page }) => {
  await page.goto('/');
  const title = page.getByLabel('Notebook title');
  await title.fill('Notebook A');
  await title.press('Enter');
  await expect(title).toHaveValue('Notebook A');
  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Notebook menu' }).click();
  await page.getByRole('menuitem', { name: 'New notebook' }).click();
  await expect(title).toHaveValue('Untitled notebook');
  await page.getByRole('button', { name: 'Notebook menu' }).click();
  await page.getByRole('menuitem', { name: 'Open notebook…' }).click();
  await page.getByRole('button', { name: /Notebook A/ }).click();
  await expect(title).toHaveValue('Notebook A');
});

test('voice control makes a genuine recognition attempt without a fabricated transcript', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Voice tool/ }).click();
  const panel = page.getByTestId('voice-panel');
  await expect(panel).toBeVisible();
  const guide = panel.getByText('What can I say?', { exact: true });
  await guide.click();
  for (const category of ['Basic', 'Calculus', 'Functions', 'Greek', 'Linear algebra', 'Sets & logic']) {
    await expect(panel.getByText(category, { exact: true })).toBeVisible();
  }
  await expect(panel).toContainText('x square');
  await expect(panel).toContainText('partial derivative of x squared with respect to x');
  await expect(panel).toContainText('three by three matrix one two three four five six seven eight nine');
  await expect(panel).toContainText('p if and only if q');
  await guide.click();
  const start = page.getByRole('button', { name: 'Start listening' });
  if (await start.isVisible()) {
    await start.click();
    await expect(panel).toContainText(
      /requesting microphone|listening|interim transcript|finalizing|finished|error/i,
    );
  }
  await expect(panel).not.toContainText(/x\s*=\s*-6/);
  await page.screenshot({ path: 'docs/screenshots/05-voice-listening.png' });
});
