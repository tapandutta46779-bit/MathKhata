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
  await expect(page.getByRole('button', { name: /Add (?:on next line|result)/ })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/07-local-assistant.png' });
  await page.getByRole('button', { name: /Add (?:on next line|result)/ }).click();
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
  await expect(assistant).toContainText('AION');
  await expect(assistant).not.toContainText('Qwen');
  await expect(assistant).not.toContainText('Ollama');
  await assistant.getByRole('button', { name: /Page outline/ }).click();
  await expect(assistant.locator('.page-problem')).toHaveCount(3);
  await expect(assistant).toContainText('Possible equation system');
  await expect(assistant).toContainText('Separate question');
  await expect(assistant).toContainText('Recognition review');
  await expect(assistant).toContainText('These equations form one system.');
  await expect(assistant).toContainText('Likely voice text');

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
    return {
      contentFits: !!content && !!contentElement && contentElement.scrollWidth <= contentElement.clientWidth + 1,
      controlsFollowContent: !!content && toggles.every((rect) => content.right <= rect.left + 0.5),
      controlsClearRail: !calculationRail || toggles.every((rect) => rect.right <= calculationRail.left),
      rightmostControl: Math.max(0, ...toggles.map((rect) => rect.right)),
      railLeft: calculationRail?.left ?? null,
    };
  });
  expect(controlsClearContent).toEqual(expect.objectContaining({ contentFits: true, controlsFollowContent: true, controlsClearRail: true }));
  await expect(field.locator('[part~="menu-toggle"]')).toBeVisible();
  await expect(field.locator('[part~="virtual-keyboard-toggle"]')).toBeVisible();

  await page.getByRole('button', { name: 'Toggle symbol palette' }).click();
  await page.getByRole('tab', { name: 'Advanced calculus' }).click();
  await expect(page.getByRole('button', { name: 'Insert Triple integral' })).toBeVisible();
  await page.getByRole('tab', { name: 'Advanced notation' }).click();
  await expect(page.getByRole('button', { name: 'Insert Norm' })).toBeVisible();
  await page.getByRole('button', { name: 'Close symbol palette' }).click();

  await page.getByRole('button', { name: /Open page assistant/ }).click();
  await page.getByTestId('page-assistant').getByRole('button', { name: /Page outline/ }).click();
  const assistantMath = page.locator('math-field.page-assistant-math').first();
  await expect(assistantMath).toBeVisible();
  await expect.poll(() => assistantMath.evaluate((element: any) => element.value)).not.toContain('\\begin{multline}');
  await page.screenshot({ path: 'docs/screenshots/12-human-multiline-math.png' });
});

test('continuous composer writes mixed ruled lines and research tools stay viewport-safe', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const composer = page.getByLabel('Continuous notebook line');
  await expect(composer).toBeVisible();
  await composer.fill('x^2 + 6 = 42');
  await composer.press('Enter');
  await expect(page.locator('math-field.math-editor')).toHaveCount(1);

  await composer.fill('The curve $x^2+y^2=1$ is a circle');
  await composer.press('Enter');
  await expect(page.locator('math-field.math-editor')).toHaveCount(2);
  await expect(page.getByLabel('Text note')).toHaveCount(2);

  await page.getByRole('button', { name: 'Open graph and research workspace' }).click();
  const research = page.getByTestId('research-tools-panel');
  await expect(research).toBeVisible();
  await expect(research.getByRole('button', { name: '2D Graph', exact: true })).toHaveClass(/is-active/);
  await expect(research.getByLabel('Interactive 2D graph')).toBeVisible();
  await research.getByRole('button', { name: 'Zoom in' }).click();
  await research.getByRole('button', { name: '+ Add expression' }).click();
  await expect(research.getByRole('textbox', { name: 'Expression 3', exact: true })).toBeVisible();
  await research.getByRole('textbox', { name: 'Expression 3', exact: true }).fill('(x-2)^2+(y+1)^2=9');
  await research.getByRole('button', { name: '2D graph settings' }).click();
  await expect(research.getByLabel('2D graph settings panel')).toBeVisible();
  await research.getByLabel('Lock viewport').check();
  await expect(research.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  await research.getByLabel('Lock viewport').uncheck();
  await research.getByRole('button', { name: 'Close 2D graph settings' }).click();
  await research.getByRole('button', { name: '3D Surface' }).click();
  await expect(research.getByLabel('Interactive 3D graph')).toBeVisible();
  await expect(research.getByLabel('3D surface expression 1')).toHaveValue('a*sin(x)*cos(y)');
  await research.getByRole('button', { name: '+ Add surface' }).click();
  await research.getByLabel('3D surface expression 2').fill('x^2-y^2');
  await expect(research.getByLabel('Parameter a value')).toBeVisible();
  await research.getByRole('button', { name: '+ Point' }).click();
  await expect(research.getByLabel('3D point 1 z coordinate')).toBeVisible();
  await research.getByRole('button', { name: '+ Parametric curve' }).click();
  await expect(research.getByLabel('3D curve 1 z expression')).toHaveValue('t/3');
  await research.getByRole('button', { name: '+ Parametric surface' }).click();
  await expect(research.getByLabel('Parametric surface 1 z expression')).toHaveValue('sin(v)');
  await research.getByRole('button', { name: '+ Add implicit F(x,y,z)=0' }).click();
  await expect(research.getByLabel('Implicit surface expression 1')).toHaveValue('x^2+y^2+z^2-9');
  await research.getByLabel('3D surface expression 2').fill('x^2-y^2{x>-2}{x<2}');
  await research.getByRole('button', { name: '3D graph settings' }).click();
  await research.getByLabel('3D rendering style').selectOption('mesh');
  await research.getByRole('button', { name: 'Zoom 3D view in' }).click();
  await research.getByLabel('Lock zoom').check();
  await expect(research.getByRole('button', { name: 'Zoom 3D view in' })).toBeDisabled();
  await research.getByLabel('Lock zoom').uncheck();
  await research.getByRole('button', { name: 'Close 3D graph settings' }).click();
  await research.getByRole('button', { name: 'Geometry', exact: true }).click();
  const geometryCanvas = research.getByLabel('Interactive geometry canvas');
  await expect(geometryCanvas).toBeVisible();
  await expect(research.getByRole('button', { name: 'Construct circle' })).toBeVisible();
  await research.getByRole('button', { name: 'Construct segment' }).click();
  await geometryCanvas.click({ position: { x: 150, y: 180 } });
  await geometryCanvas.click({ position: { x: 310, y: 260 } });
  await expect(research.getByRole('button', { name: /Segment AB/ })).toBeVisible();
  await expect(research.getByLabel('Point A x coordinate')).toBeVisible();
  await research.getByLabel('Geometry construction expression').fill('midpoint(A,B)');
  await research.getByLabel('Geometry construction expression').press('Enter');
  await expect(research.getByLabel('Point C x coordinate')).toBeVisible();
  await research.getByLabel('Point A x coordinate').fill('0');
  await research.getByLabel('Point B x coordinate').fill('4');
  await expect(research.getByLabel('Point C x coordinate')).toHaveValue('2');
  await research.getByLabel('Geometry construction expression').fill('circle(A,3)');
  await research.getByLabel('Geometry construction expression').press('Enter');
  await research.getByRole('button', { name: /circle\(A, 3\.000\)/i }).click();
  const circleRadiusInput = research.getByRole('spinbutton', { name: 'Selected circle radius', exact: true });
  await expect(circleRadiusInput).toHaveValue('3');
  await circleRadiusInput.fill('4');
  await expect(research.getByRole('button', { name: /circle\(A, 4\.000\)/i })).toBeVisible();
  await research.getByRole('button', { name: /Segment AB/ }).click();
  await expect(research.getByLabel('Selected geometry controls')).toBeVisible();
  await research.getByRole('button', { name: 'Translate copy' }).click();
  await expect(research.getByText('1 selected')).toBeVisible();
  await expect(research.getByRole('button', { name: 'Construct perpendicular line' })).toBeVisible();
  await research.getByRole('button', { name: 'Move points and pan' }).click();
  await research.getByRole('button', { name: 'Zoom geometry in' }).click();
  await research.getByRole('button', { name: 'Close research tools' }).click();
  await page.getByRole('button', { name: 'Open graph and research workspace' }).click();
  await expect(research.getByRole('button', { name: 'Geometry', exact: true })).toHaveClass(/is-active/);
  await expect(research.getByRole('button', { name: /Segment AB/ })).toBeVisible();
  await research.getByRole('button', { name: 'Scientific' }).click();
  const scientificField = research.getByLabel('Scientific expression', { exact: true });
  await expect(scientificField).toBeVisible();
  await scientificField.evaluate((element: any) => {
    element.value = '6\\times4';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
  });
  await scientificField.press('Enter');
  await expect(research.getByText('≈ 24')).toBeVisible();
  await scientificField.evaluate((element: any) => {
    element.value = '\\operatorname{ans}+1';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
  });
  await scientificField.press('Enter');
  await expect(research.getByText('≈ 25')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => innerWidth));
  await research.getByRole('button', { name: 'Close research tools' }).click();

  await page.getByRole('button', { name: 'Toggle floating calculator' }).click();
  const calculator = page.getByTestId('floating-calculator');
  await calculator.getByLabel('Calculator expression').fill('6*4');
  await calculator.getByLabel('Calculator expression').press('Enter');
  await expect(calculator.getByText(/24/)).toBeVisible();
});

test('research canvases keep square coordinates and viewport-safe controls at 1280 by 659', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 659 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open graph and research workspace' }).click();
  const research = page.getByTestId('research-tools-panel');
  const expectCanvasMatchesLayout = async (label: string) => {
    await expect.poll(async () => research.getByLabel(label).evaluate((canvas: HTMLCanvasElement) => {
      const bounds = canvas.getBoundingClientRect();
      return Math.max(Math.abs(canvas.width - bounds.width), Math.abs(canvas.height - bounds.height));
    })).toBeLessThanOrEqual(2);
  };
  const expectInViewport = async (locator: ReturnType<typeof page.locator>) => {
    const bounds = await locator.boundingBox();
    if (!bounds) throw new Error('Expected a visible research control');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1280.5);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(659.5);
  };

  await expectCanvasMatchesLayout('Interactive 2D graph');
  const graph2DSettings = research.getByRole('button', { name: '2D graph settings', exact: true });
  await graph2DSettings.click();
  await expectInViewport(research.getByLabel('2D graph settings panel'));
  await graph2DSettings.click();
  await expect(research.getByLabel('2D graph settings panel')).toBeHidden();
  await graph2DSettings.click();
  await page.keyboard.press('Escape');
  await expect(research.getByLabel('2D graph settings panel')).toBeHidden();
  await graph2DSettings.click();
  await research.getByLabel('Interactive 2D graph').click({ position: { x: 80, y: 80 } });
  await expect(research.getByLabel('2D graph settings panel')).toBeHidden();

  await research.getByRole('button', { name: '3D Surface', exact: true }).click();
  await expectCanvasMatchesLayout('Interactive 3D graph');
  const graph3DSettings = research.getByRole('button', { name: '3D graph settings', exact: true });
  await graph3DSettings.click();
  await expectInViewport(research.getByLabel('3D graph settings panel'));
  await expect(research.getByLabel('3D x minimum')).toHaveValue('-5');
  await expect(research.getByLabel('3D z maximum')).toHaveValue('5');
  await research.getByLabel('3D x minimum').fill('-8');
  await research.getByLabel('3D x maximum').fill('12');
  await expect(research.getByLabel('3D x minimum')).toHaveValue('-8');
  await expect(research.getByLabel('3D x maximum')).toHaveValue('12');
  await expect(research.getByLabel('3D y maximum')).toHaveValue('5');
  await graph3DSettings.click();
  await expect(research.getByLabel('3D graph settings panel')).toBeHidden();

  const graph3DCanvas = research.getByLabel('Interactive 3D graph');
  const cameraState = () => page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((entry) => entry.endsWith(':3d:camera'));
    if (!key) return null;
    return JSON.parse(window.localStorage.getItem(key) ?? 'null') as { yaw: number; pitch: number; zoom: number } | null;
  });
  const canvasBounds = await graph3DCanvas.boundingBox();
  if (!canvasBounds) throw new Error('Expected the 3D canvas to be visible');
  await graph3DCanvas.evaluate((canvas) => {
    canvas.addEventListener('pointerdown', (event) => { canvas.dataset.lastPointerId = String((event as PointerEvent).pointerId); });
  });
  const cameraBefore = await cameraState();
  if (!cameraBefore) throw new Error('Expected persisted 3D camera state');
  const orbitY = canvasBounds.y + canvasBounds.height * .55;
  const orbitLeft = canvasBounds.x + canvasBounds.width * .42;
  await page.mouse.move(orbitLeft, orbitY);
  await page.mouse.down();
  await page.mouse.move(orbitLeft + 150, orbitY, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await cameraState())?.yaw ?? cameraBefore.yaw).toBeLessThan(cameraBefore.yaw);
  const cameraAfterRight = await cameraState();
  if (!cameraAfterRight) throw new Error('Expected 3D camera after rightward orbit');
  expect(cameraBefore.yaw - cameraAfterRight.yaw).toBeGreaterThan(.45);
  expect(cameraBefore.yaw - cameraAfterRight.yaw).toBeLessThan(.75);
  await expect.poll(() => graph3DCanvas.evaluate((canvas) => {
    const pointerId = Number(canvas.dataset.lastPointerId);
    return Number.isFinite(pointerId) && !canvas.hasPointerCapture(pointerId);
  })).toBe(true);

  await page.mouse.move(orbitLeft + 150, orbitY);
  await page.mouse.down();
  await page.mouse.move(orbitLeft, orbitY, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await cameraState())?.yaw ?? cameraAfterRight.yaw).toBeGreaterThan(cameraAfterRight.yaw);
  const cameraAfterLeft = await cameraState();
  if (!cameraAfterLeft) throw new Error('Expected 3D camera after leftward orbit');
  expect(Math.abs(cameraAfterLeft.yaw - cameraBefore.yaw)).toBeLessThan(.05);

  const verticalX = canvasBounds.x + canvasBounds.width * .62;
  const verticalTop = canvasBounds.y + 30;
  const verticalBottom = canvasBounds.y + canvasBounds.height - 30;
  await page.mouse.move(verticalX, verticalTop);
  await page.mouse.down();
  await page.mouse.move(verticalX, verticalBottom, { steps: 8 });
  await page.mouse.up();
  const cameraAfterDown = await cameraState();
  if (!cameraAfterDown) throw new Error('Expected 3D camera after vertical orbit');
  expect(cameraAfterDown.pitch).toBeGreaterThan(cameraAfterLeft.pitch);
  expect(cameraAfterDown.pitch).toBeLessThanOrEqual(1.52);
  await page.mouse.move(verticalX, verticalBottom);
  await page.mouse.down();
  await page.mouse.move(verticalX, verticalTop, { steps: 8 });
  await page.mouse.up();
  const cameraAfterUp = await cameraState();
  if (!cameraAfterUp) throw new Error('Expected 3D camera after repeated vertical orbit');
  expect(cameraAfterUp.pitch).toBeGreaterThanOrEqual(-1.52);
  expect(cameraAfterUp.pitch).toBeLessThan(cameraAfterDown.pitch);

  await research.getByRole('button', { name: 'Geometry', exact: true }).click();
  await expectCanvasMatchesLayout('Interactive geometry canvas');
  await research.getByRole('button', { name: 'Zoom geometry in' }).click();
  await expectInViewport(research.getByRole('toolbar', { name: 'Geometry tools' }));

  await research.getByRole('button', { name: 'Scientific', exact: true }).click();
  await expectInViewport(research.getByRole('button', { name: 'Enter ↵' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => innerWidth));
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
  await assistant.getByRole('button', { name: /Page outline/ }).click();
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
