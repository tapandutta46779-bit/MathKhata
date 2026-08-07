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
  await expect.poll(() => textField.evaluate((element) => document.activeElement === element)).toBe(true);
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

  await page.getByRole('tab', { name: 'Calculus', exact: true }).click();
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
  await expect(panel).toContainText('x equals six, then y equals eight');
  await expect(panel).toContainText('remember to check the boundary');
  for (const category of ['Basic', 'Calculus', 'Advanced calculus', 'Functions', 'Greek', 'Linear algebra', 'Sets & logic', 'Advanced notation']) {
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
  await expect(panel).not.toContainText('phrases-not-supported');
  await page.screenshot({ path: 'docs/screenshots/05-voice-listening.png' });
});

test('paper-like lines offer a quiet calculation and an opt-in local solve', async ({ page }) => {
  await page.goto('/');
  const paper = page.getByTestId('notebook-page');
  const bounds = await paper.boundingBox();
  if (!bounds) throw new Error('Notebook page has no visible bounds');

  await page.getByRole('button', { name: /Math tool/ }).click();
  await page.mouse.click(bounds.x + 125, bounds.y + 65);
  const firstField = page.locator('math-field.math-editor').first();
  await expect(firstField).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => firstField.evaluate((field) => document.activeElement === field)).toBe(true);
  await page.keyboard.type('6*4');
  await expect(page.getByRole('button', { name: 'Accept calculation result 24' })).toBeVisible();

  const firstObject = page.getByTestId('page-object-math').first();
  const visualChrome = await firstObject.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderStyle: style.borderStyle,
      backgroundColor: style.backgroundColor,
      top: Number.parseFloat((element as HTMLElement).style.top),
    };
  });
  expect(visualChrome).toEqual({
    borderStyle: 'none',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    top: 64,
  });

  await page.keyboard.press('Tab');
  await expect.poll(() => firstField.evaluate((field: any) => field.value)).toContain('=24');
  await expect(page.getByRole('button', { name: 'Accept calculation result 24' })).toHaveCount(0);

  await page.getByRole('button', { name: /Math tool/ }).click();
  await page.mouse.click(bounds.x + 125, bounds.y + 125);
  const equationField = page.locator('math-field.math-editor').nth(1);
  await expect(equationField).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => equationField.evaluate((field) => document.activeElement === field)).toBe(true);
  await page.keyboard.type('x^2=4');
  await page.getByRole('button', { name: /Solve equation/ }).click();
  await expect(page.getByText('Solve for x', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Add on next line' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/07-local-assistant.png' });
  await page.getByRole('button', { name: 'Add on next line' }).click();
  await expect(page.getByTestId('page-object-math')).toHaveCount(3);
  await expect.poll(async () =>
    Number.parseFloat(
      (await page.getByTestId('page-object-math').nth(2).getAttribute('style'))
        ?.match(/top:\s*([\d.]+)px/)?.[1] ?? '0',
    )
  ).toBe(152);
});

test('finite integrals survive reload and evaluate after first focus', async ({ page }) => {
  await page.goto('/');
  const paper = page.getByTestId('notebook-page');
  const bounds = await paper.boundingBox();
  if (!bounds) throw new Error('Notebook page has no visible bounds');

  await page.getByRole('button', { name: /Math tool/ }).click();
  await page.mouse.click(bounds.x + 125, bounds.y + 65);
  let field = page.locator('math-field.math-editor').first();
  await expect(field).toHaveAttribute('data-ready', 'true');
  await field.evaluate((element: any) => {
    element.value = '\\int_{0}^{\\pi}\\cos(x)\\,\\mathrm{d}x';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('\\int');
  await expect(page.getByRole('button', { name: 'Solve integral' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible({ timeout: 10_000 });

  await page.reload();
  field = page.locator('math-field.math-editor').first();
  await expect(field).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('\\int');
  const beforeFocus = await field.evaluate((element: any) => element.value);
  await field.click();
  await expect.poll(() => field.evaluate((element: any) => element.value)).toBe(beforeFocus);
  await expect(page.getByRole('button', { name: 'Solve integral' })).toBeVisible();

  await page.getByRole('button', { name: 'Solve integral' }).click();
  await expect(page.getByText('Integral value', { exact: true })).toBeVisible({ timeout: 10_000 });
  const result = page.locator('math-field.assistant-math').first();
  await expect.poll(() => result.evaluate((element: any) => element.value)).toBe('0');
});

test('retains every on-demand MathLive, Symbols, Voice, menu, and navigation path', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Open page assistant with 0 problem groups/ })).toBeVisible();
  const paper = page.getByTestId('notebook-page');
  const bounds = await paper.boundingBox();
  if (!bounds) throw new Error('Notebook page has no visible bounds');
  await page.getByRole('button', { name: /Math tool/ }).click();
  await page.mouse.click(bounds.x + 130, bounds.y + 100);
  const field = page.locator('math-field.math-editor').first();
  await expect(field).toHaveAttribute('data-ready', 'true');
  await expect(page.getByLabel('Selected object controls')).toContainText('Math');
  await expect(page.getByRole('button', { name: 'Drag object' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duplicate selected object' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete selected object' })).toBeVisible();

  await field.click();
  await page.keyboard.type('x+1');
  const endPosition = await field.evaluate((element: any) => element.position);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => field.evaluate((element: any) => element.position)).toBeLessThan(endPosition);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => field.evaluate((element: any) => element.position)).toBe(endPosition);
  await page.waitForTimeout(100);

  const canvas = page.locator('.canvas-scroll');
  await canvas.evaluate((element) => { element.scrollTop = 160; });
  const scrollBeforeSpace = await canvas.evaluate((element) => element.scrollTop);
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  expect(await canvas.evaluate((element) => element.scrollTop)).toBe(scrollBeforeSpace);

  const keyboardToggle = field.locator('[part~="virtual-keyboard-toggle"]');
  const menuToggle = field.locator('[part~="menu-toggle"]');
  await expect(keyboardToggle).toBeVisible();
  await expect(menuToggle).toBeVisible();
  await keyboardToggle.click();
  await expect.poll(() => field.evaluate(() => window.mathVirtualKeyboard.visible)).toBe(true);
  expect(await field.evaluate(() => window.mathVirtualKeyboard.layouts)).toEqual([
    'numeric', 'symbols', 'alphabetic', 'greek',
  ]);
  for (const label of ['123', '∞≠∈', 'abc', 'αβγ']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  const virtualLeft = page.locator(`[data-command='"performWithFeedback(moveToPreviousChar)"']:visible`).first();
  const virtualRight = page.locator(`[data-command='"performWithFeedback(moveToNextChar)"']:visible`).first();
  await field.evaluate((element: any) => { element.position = element.lastOffset; });
  const virtualEnd = await field.evaluate((element: any) => element.position);
  await virtualLeft.click();
  await expect.poll(() => field.evaluate((element: any) => element.position)).toBeLessThan(virtualEnd);
  await virtualRight.click();
  await expect.poll(() => field.evaluate((element: any) => element.position)).toBe(virtualEnd);
  await page.waitForTimeout(100);
  await canvas.evaluate((element) => { element.scrollTop = 160; });
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  expect(await canvas.evaluate((element) => element.scrollTop)).toBe(160);
  await page.screenshot({ path: 'docs/screenshots/08-mathlive-keyboard.png' });
  await field.evaluate(() => window.mathVirtualKeyboard.hide({ animate: false }));
  await expect.poll(() => field.evaluate(() => window.mathVirtualKeyboard.visible)).toBe(false);

  const visibleMenus = page.locator('[role="menu"]:visible');
  await menuToggle.click();
  await expect(visibleMenus).toHaveCount(1);
  await expect(visibleMenus.first()).toContainText('Insert Matrix');
  await expect(visibleMenus.first()).toContainText('Insert');
  await expect(visibleMenus.first()).toContainText('Mode');
  await expect(visibleMenus.first()).toContainText('Font Style');
  await expect(visibleMenus.first()).toContainText('Color');
  await expect(visibleMenus.first()).toContainText('Background');
  const insertMenuItem = page.getByRole('menuitem', { name: 'Insert', exact: true });
  await insertMenuItem.hover();
  await expect(visibleMenus).toHaveCount(2);
  const insertSubmenu = visibleMenus.nth(1);
  for (const item of ['Absolute Value', 'nth Root', 'Derivative', 'nth derivative', 'Integral', 'Sum', 'Product']) {
    await expect(insertSubmenu).toContainText(item);
  }
  await page.screenshot({ path: 'docs/screenshots/09-mathlive-insert-menu.png' });
  await insertMenuItem.click();
  await expect(visibleMenus).toHaveCount(0);

  await menuToggle.click();
  const matrixMenuItem = page.getByRole('menuitem', { name: 'Insert Matrix', exact: true });
  await matrixMenuItem.hover();
  await expect(visibleMenus).toHaveCount(2);
  await expect(page.locator('[role="menuitem"][data-tooltip="1 × 1"]')).toBeVisible();
  await expect(page.locator('[role="menuitem"][data-tooltip="5 × 5"]')).toBeVisible();
  await expect(page.locator('[role="menuitem"][data-tooltip]')).toHaveCount(25);
  await page.screenshot({ path: 'docs/screenshots/10-mathlive-matrix-picker.png' });
  await matrixMenuItem.click();
  await expect(visibleMenus).toHaveCount(0);

  await menuToggle.click();
  await expect(visibleMenus).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(visibleMenus).toHaveCount(0);
  await menuToggle.click();
  await page.mouse.click(8, 650);
  await expect(visibleMenus).toHaveCount(0);
  await menuToggle.click();
  await page.getByRole('menuitem', { name: 'Insert', exact: true }).hover();
  const nthRoot = page.locator('[role="menuitem"]:visible').filter({ hasText: /nth Root/ }).last();
  await expect(nthRoot).toBeVisible();
  await nthRoot.click();
  await expect(visibleMenus).toHaveCount(0);
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('\\sqrt');

  await page.getByRole('button', { name: 'Toggle symbol palette' }).click();
  const palette = page.getByTestId('math-palette');
  await expect(palette).toBeVisible();
  const categoryExamples = [
    ['Basic', 'Insert Fraction'],
    ['Calculus', 'Insert Definite integral'],
    ['Advanced calculus', 'Insert Double integral'],
    ['Functions', 'Insert Sine'],
    ['Greek', 'Insert alpha'],
    ['Linear algebra', 'Insert 2 by 2 matrix'],
    ['Sets & logic', 'Insert Element of'],
    ['Advanced notation', 'Insert Cases'],
  ] as const;
  for (const [category, insertion] of categoryExamples) {
    await page.getByRole('tab', { name: category, exact: true }).click();
    await expect(page.getByRole('button', { name: insertion, exact: true })).toBeVisible();
  }

  async function resetField(latex = '') {
    await field.evaluate((element: any, value) => {
      element.value = value;
      element.position = element.lastOffset;
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }, latex);
    await field.click();
    await field.evaluate((element: any) => { element.position = element.lastOffset; });
  }

  await page.getByRole('tab', { name: 'Basic' }).click();
  await resetField();
  await page.getByRole('button', { name: 'Insert Fraction' }).click();
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  await expect.poll(() => field.evaluate((element: any) => element.value)).toMatch(/\\frac\{?1\}?\{?2\}?/);

  await resetField();
  await page.getByRole('button', { name: 'Insert Square root' }).click();
  await page.keyboard.type('9');
  await page.keyboard.press('Tab');
  await page.keyboard.type('+1');
  await expect.poll(() => field.evaluate((element: any) => element.value)).toMatch(/\\sqrt(?:\{9\}|9)\+1/);

  await resetField('x');
  await page.getByRole('button', { name: 'Insert Power' }).click();
  await page.keyboard.type('2');
  await page.keyboard.press('Tab');
  await page.keyboard.type('+1');
  await expect.poll(() => field.evaluate((element: any) => element.value)).toMatch(/x\^(?:\{2\}|2)\+1/);

  await resetField('x');
  await page.getByRole('button', { name: 'Insert Power' }).click();
  await page.keyboard.type('3');
  await canvas.evaluate((element) => { element.scrollTop = 160; });
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  expect(await canvas.evaluate((element) => element.scrollTop)).toBe(160);
  await page.keyboard.type('+2');
  await expect.poll(() => field.evaluate((element: any) => element.value)).toMatch(/x\^(?:\{3\}|3)\+2/);

  await page.getByRole('tab', { name: 'Calculus', exact: true }).click();
  await resetField();
  await page.getByRole('button', { name: 'Insert Definite integral' }).click();
  // MathLive traverses the visual upper limit before the lower limit.
  for (const [index, value] of ['2', '0', 'x', 'x'].entries()) {
    await page.keyboard.type(value);
    if (index < 3) await page.keyboard.press('Tab');
  }
  await expect.poll(() => field.evaluate((element: any) => element.value)).toMatch(/\\int_(?:\{0\}|0)\^(?:\{2\}|2)x/);

  await page.getByRole('tab', { name: 'Linear algebra' }).click();
  await resetField();
  await page.getByRole('button', { name: 'Insert 2 by 2 matrix' }).click();
  const firstMatrixSelection = await field.evaluate((element: any) => JSON.stringify(element.selection));
  await page.keyboard.press('Tab');
  const secondMatrixSelection = await field.evaluate((element: any) => JSON.stringify(element.selection));
  expect(secondMatrixSelection).not.toBe(firstMatrixSelection);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => field.evaluate((element: any) => JSON.stringify(element.selection))).toBe(firstMatrixSelection);
  for (const [index, value] of ['1', '2', '3', '4'].entries()) {
    await page.keyboard.type(value);
    if (index < 3) await page.keyboard.press('Tab');
  }
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('\\begin{pmatrix}');
  await expect.poll(() => field.evaluate((element: any) => element.value)).toMatch(/1\s*&\s*2\\\\\s*3\s*&\s*4/);

  await page.getByRole('button', { name: /Voice tool/ }).click();
  await expect(page.getByTestId('voice-panel')).toBeVisible();
  await expect(palette).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start listening' })).toBeVisible();
});

test('whole-page assistant separates questions, reads notes, reviews voice corruption, and solves a system', async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto('/');
  const paper = page.getByTestId('notebook-page');

  async function addMath(y: number, latex: string) {
    const bounds = await paper.boundingBox();
    if (!bounds) throw new Error('Notebook page has no visible bounds');
    const fields = page.locator('math-field.math-editor');
    const countBefore = await fields.count();
    await page.getByRole('button', { name: /Math tool/ }).click();
    await page.mouse.click(bounds.x + 130, bounds.y + y);
    await expect(fields).toHaveCount(countBefore + 1);
    const field = fields.last();
    await expect(field).toHaveAttribute('data-ready', 'true');
    await expect.poll(() => field.evaluate((element) => document.activeElement === element)).toBe(true);
    await page.keyboard.type(latex);
    return field;
  }

  await addMath(65, 'x+y=3');
  await addMath(110, 'x-y=1');
  const bounds = await paper.boundingBox();
  if (!bounds) throw new Error('Notebook page has no visible bounds');
  await page.getByRole('button', { name: /Text tool/ }).click();
  await page.mouse.click(bounds.x + 130, bounds.y + 155);
  const note = page.getByLabel('Text note');
  await expect.poll(() => note.evaluate((element) => document.activeElement === element)).toBe(true);
  await note.fill('These equations form one system.');
  const separateEquation = await addMath(305, 'z^2=4');
  await addMath(350, 'why=0');

  const assistant = page.getByTestId('page-assistant');
  await page.getByRole('button', { name: /Open page assistant/ }).click();
  await expect(assistant).toBeVisible();
  await expect(assistant.locator('.page-problem')).toHaveCount(3);
  await expect(assistant).toContainText('Possible equation system');
  await expect(assistant).toContainText('Separate question');
  await expect(assistant).toContainText('Recognition review');
  await expect(assistant).toContainText('These equations form one system.');
  await expect(assistant).toContainText('Likely voice text');
  await expect(assistant.getByRole('button', { name: /Enable AION/ })).toBeVisible();
  await expect(assistant).toContainText('Qwen2.5 0.5B Instruct');

  const system = assistant.locator('.page-problem--system');
  await system.getByRole('button', { name: 'Solve this problem' }).click();
  await expect(system).toContainText('System solution', { timeout: 10_000 });
  await expect(system.locator('math-field.page-assistant-math').last()).toHaveAttribute('read-only', '');
  await page.screenshot({ path: 'docs/screenshots/11-page-assistant.png' });

  const review = assistant.locator('.page-problem--review');
  await review.getByRole('button', { name: 'Convert to Text' }).click();
  await expect(page.locator('math-field.math-editor')).toHaveCount(3);
  await expect(page.getByLabel('Text note')).toHaveCount(2);
  await expect(assistant).not.toContainText('Recognition review');

  await separateEquation.click();
  await expect(page.getByRole('button', { name: /Solve equation/ })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse page assistant' }).click();
  const launcher = page.getByRole('button', { name: /Open page assistant/ });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(assistant).toBeVisible();
});

test('long structured mathematics flows across ruled lines without hiding controls', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const paper = page.getByTestId('notebook-page');
  const bounds = await paper.boundingBox();
  if (!bounds) throw new Error('Notebook page has no visible bounds');
  await page.getByRole('button', { name: /Math tool/ }).click();
  await page.mouse.click(bounds.x + 130, bounds.y + 68);
  const field = page.locator('math-field.math-editor').first();
  await expect(field).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => field.evaluate((element) => document.activeElement === element)).toBe(true);

  await page.keyboard.type('x^12+2*x^11+3*x^10+4*x^9+5*x^8+6*x^7+7*x^6+8*x^5+9*x^4+10*x^3+11*x^2+12*x+13=0');
  await expect(field).toHaveAttribute('data-auto-multiline', 'true');
  await expect.poll(() => field.evaluate((element: any) => Number(element.dataset.lineCount))).toBeGreaterThan(1);
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('\\begin{multline}');

  const object = page.getByTestId('page-object-math').first();
  await expect.poll(async () => Number.parseFloat(
    (await object.getAttribute('style'))?.match(/min-height:\s*([\d.]+)px/)?.[1] ?? '0',
  )).toBeGreaterThanOrEqual(88);
  const controlsClearContent = await field.evaluate((element) => {
    const content = element.shadowRoot?.querySelector('[part="content"]')?.getBoundingClientRect();
    const contentElement = element.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null;
    const calculationRail = element.ownerDocument.querySelector('.calculation-rail')?.getBoundingClientRect();
    const toggles = [...(element.shadowRoot?.querySelectorAll('[part="menu-toggle"], [part="virtual-keyboard-toggle"]') ?? [])]
      .map((item) => item.getBoundingClientRect())
      .filter((rect) => rect.width > 0);
    return !!content
      && !!contentElement
      && contentElement.scrollWidth <= contentElement.clientWidth + 1
      && toggles.every((rect) => content.right <= rect.left + 0.5)
      && (!calculationRail || toggles.every((rect) => rect.right <= calculationRail.left));
  });
  expect(controlsClearContent).toBe(true);
  await expect(field.locator('[part~="menu-toggle"]')).toBeVisible();
  await expect(field.locator('[part~="virtual-keyboard-toggle"]')).toBeVisible();

  await page.getByRole('button', { name: 'Toggle symbol palette' }).click();
  await page.getByRole('tab', { name: 'Advanced calculus' }).click();
  await expect(page.getByRole('button', { name: 'Insert Triple integral' })).toBeVisible();
  await page.getByRole('tab', { name: 'Advanced notation' }).click();
  await expect(page.getByRole('button', { name: 'Insert Norm' })).toBeVisible();
  await page.getByRole('button', { name: 'Close symbol palette' }).click();

  await page.getByRole('button', { name: /Open page assistant/ }).click();
  const assistantMath = page.locator('math-field.page-assistant-math').first();
  await expect(assistantMath).toBeVisible();
  await expect.poll(() => assistantMath.evaluate((element: any) => element.value)).not.toContain('\\begin{multline}');
  await page.screenshot({ path: 'docs/screenshots/12-human-multiline-math.png' });
});

test('keeps page assistant and notebook menu responsive, dismissible, and closed by preference', async ({ page }) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 1280, height: 659 });
  await page.goto('/');
  const paper = page.getByTestId('notebook-page');
  const bounds = await paper.boundingBox();
  if (!bounds) throw new Error('Notebook page has no visible bounds');
  await page.getByRole('button', { name: /Math tool/ }).click();
  await page.mouse.click(bounds.x + 130, bounds.y + 90);
  const field = page.locator('math-field.math-editor').first();
  await expect(field).toHaveAttribute('data-ready', 'true');
  await page.keyboard.type('x=1');

  const widthState = () => page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    scrollX: window.scrollX,
  }));
  const expectViewportContained = async (locator: ReturnType<typeof page.locator>) => {
    const rect = await locator.boundingBox();
    if (!rect) throw new Error('Expected a visible viewport control');
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) + 0.5);
    return rect;
  };
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

  const launcher = page.getByRole('button', { name: /Open page assistant/ });
  const assistant = page.getByTestId('page-assistant');
  const notebookMenuButton = page.getByRole('button', { name: 'Notebook menu' });
  await expect(launcher).toBeVisible();
  await expect(assistant).toHaveCount(0);
  await launcher.click();
  await expect(assistant).toBeVisible();
  await expect.poll(widthState).toEqual({ viewport: 1280, document: 1280, scrollX: 0 });
  const menuTriggerRect = await expectViewportContained(notebookMenuButton);
  const assistantCloseRect = await expectViewportContained(page.getByRole('button', { name: 'Close page assistant' }));
  expect(overlaps(menuTriggerRect, assistantCloseRect)).toBe(false);

  await page.getByRole('button', { name: 'Close page assistant' }).click();
  await expect(assistant).toHaveCount(0);
  await expect(launcher).toBeVisible();
  await field.dblclick();
  await expect.poll(() => field.evaluate((element) => document.activeElement === element)).toBe(true);
  await field.evaluate((element: any) => { element.position = element.lastOffset; });
  await page.keyboard.type('+1');
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('x=1+1');
  await expect(assistant).toHaveCount(0);

  await launcher.click();
  await page.getByRole('button', { name: 'Analyze page again' }).click();
  await page.getByRole('button', { name: 'Collapse page assistant' }).click();
  await expect(launcher).toBeVisible();
  await expect(assistant).toHaveCount(0);

  await notebookMenuButton.click();
  const notebookMenu = page.locator('.overflow-menu');
  await expect(notebookMenu).toBeVisible();
  await expectViewportContained(notebookMenu);
  await expect(assistant).toHaveCount(0);
  await notebookMenuButton.click();
  await expect(notebookMenu).toHaveCount(0);
  await notebookMenuButton.click();
  await page.keyboard.press('Escape');
  await expect(notebookMenu).toHaveCount(0);
  await notebookMenuButton.click();
  await page.mouse.click(500, 350);
  await expect(notebookMenu).toHaveCount(0);
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('x=1+1');

  await page.getByRole('button', { name: '+ Add page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(assistant).toHaveCount(0);
  await page.getByRole('button', { name: 'Open page 1' }).click();
  await expect(launcher).toBeVisible();
  await expect(assistant).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(launcher).toBeVisible();
  await expect(assistant).toHaveCount(0);
  await expect.poll(widthState).toEqual({ viewport: 1280, document: 1280, scrollX: 0 });

  await page.setViewportSize({ width: 760, height: 659 });
  await expect.poll(widthState).toEqual({ viewport: 760, document: 760, scrollX: 0 });
  await expectViewportContained(notebookMenuButton);
  await launcher.click();
  await expect(assistant).toBeVisible();
  await expectViewportContained(page.getByRole('button', { name: 'Close page assistant' }));
  await expect.poll(widthState).toEqual({ viewport: 760, document: 760, scrollX: 0 });
  await page.getByRole('button', { name: 'Close page assistant' }).click();
  await expect(launcher).toBeVisible();
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await expect.poll(() => field.evaluate((element: any) => element.value)).toContain('x=1+1');
});
