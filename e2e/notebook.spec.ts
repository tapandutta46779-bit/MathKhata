import { expect, test, type Locator, type Page } from '@playwright/test';

async function openWritingTools(page: Page): Promise<Locator> {
  const tools = page.getByLabel('Writing and mathematics tools');
  if (!await tools.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Open writing and math controls' }).click();
  }
  await expect(tools).toBeVisible();
  return tools;
}

async function selectWritingMode(page: Page, name: 'Auto text + math' | 'Text only' | 'Math only') {
  const tools = await openWritingTools(page);
  await tools.getByRole('button', { name, exact: true }).click();
}

async function writeTextLine(page: Page, value: string) {
  const writer = page.getByLabel('Write on this ruled line');
  await expect(writer).toBeVisible();
  await writer.fill(value);
  await writer.press('Enter');
}

async function writeMathLine(page: Page, latex: string): Promise<Locator> {
  await selectWritingMode(page, 'Math only');
  const writer = page.locator('math-field.line-math-composer');
  await expect(writer).toBeVisible();
  await writer.evaluate((element: any, nextLatex) => {
    element.value = nextLatex;
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertText',
    }));
  }, latex);
  await writer.press('Enter');
  const committed = page.locator('math-field.math-editor').last();
  await expect(committed).toHaveAttribute('data-ready', 'true');
  return committed;
}

test('ruled page is the editor and stores mixed text and structured math line by line', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Math Notebook/);
  await expect(page.getByTestId('notebook-page')).toBeVisible();
  await expect(page.getByLabel('Notebook title')).toHaveValue('My Math Notebook');

  await writeTextLine(page, 'Let x = 6 and remember the boundary.');
  await expect(page.getByTestId('page-object-text')).toHaveCount(2);
  await expect(page.getByTestId('page-object-math')).toHaveCount(1);
  await expect(page.getByLabel('Text note').first()).toHaveValue('Let');
  await expect(page.getByLabel('Text note').last()).toHaveValue('and remember the boundary.');

  const integral = await writeMathLine(page, String.raw`\int_0^2 x\,dx`);
  await expect.poll(() => integral.evaluate((element: any) => element.value)).toContain('\\int_0^2');
  await expect(integral.locator('xpath=..')).toHaveCSS('width', '590px');

  const paper = page.getByTestId('notebook-page');
  const bounds = await paper.boundingBox();
  if (!bounds) throw new Error('Notebook page has no visible bounds');
  await page.getByRole('button', { name: 'Write on ruled lines' }).click();
  await page.mouse.click(bounds.x + 350, bounds.y + 360);
  await expect(page.getByTestId('continuous-line-composer')).toHaveCSS('top', /3\d\dpx/);

  await expect(page.getByRole('button', { name: 'Drag object' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Duplicate object' })).toHaveCount(0);
  await expect(page.locator('.mathfield-menu-toggle:visible, .mathfield-keyboard-toggle:visible')).toHaveCount(0);

  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId('page-object-text')).toHaveCount(2);
  await expect(page.getByTestId('page-object-math')).toHaveCount(2);

  await page.getByRole('button', { name: 'Notebook menu' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export structured JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(exported).toMatchObject({ format: 'mathkhata-notebook', schemaVersion: 3 });
  expect(exported.notebook.pages[0].objects).toHaveLength(4);
  expect(exported.notebook.pages[0].drawings).toEqual([]);
});

test('central math controls retain keyboard, insertion menu, symbols, and structured notation', async ({ page }) => {
  await page.goto('/');
  await selectWritingMode(page, 'Math only');
  const tools = page.getByLabel('Writing and mathematics tools');
  const writer = page.locator('math-field.line-math-composer');
  await expect(writer).toBeFocused();

  await tools.getByRole('button', { name: '⌨ Math keyboard' }).click();
  await expect.poll(() => page.evaluate(() => window.mathVirtualKeyboard.visible)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.mathVirtualKeyboard.layouts)).toEqual([
    'numeric', 'symbols', 'alphabetic', 'greek',
  ]);
  await expect(page.getByRole('button', { name: 'Close math keyboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Close math keyboard' }).click();
  await expect.poll(() => page.evaluate(() => window.mathVirtualKeyboard.visible)).toBe(false);

  await page.getByRole('button', { name: 'Open writing and math controls' }).click();
  await expect(tools).toBeVisible();
  await tools.getByRole('button', { name: '⌨ Math keyboard' }).click();
  await expect(page.getByRole('button', { name: 'Close math keyboard' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.mathVirtualKeyboard.visible)).toBe(false);

  await page.getByRole('button', { name: 'Open writing and math controls' }).click();
  await expect(tools).toBeVisible();
  await tools.getByRole('button', { name: '☰ Insert structures' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Insert Matrix' })).toBeVisible();
  await tools.getByRole('button', { name: '☰ Insert structures' }).click();
  await expect(page.getByRole('menu')).toBeHidden();

  await tools.getByRole('button', { name: '☰ Insert structures' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();

  await tools.getByRole('button', { name: 'Ω Symbols' }).click();
  const palette = page.getByTestId('math-palette');
  await expect(palette).toBeVisible();
  await expect(tools).toBeHidden();
  await expect(page.getByRole('button', { name: 'Close math keyboard' })).toBeHidden();
  await page.getByRole('button', { name: 'Open writing and math controls' }).click();
  await expect(tools).toBeVisible();
  await expect(palette).toBeHidden();
  await tools.getByRole('button', { name: 'Ω Symbols' }).click();
  await expect(palette).toBeVisible();
  await expect(tools).toBeHidden();
  await palette.getByRole('button', { name: 'Insert Square root' }).click();
  await page.keyboard.type('x+1');
  await page.keyboard.press('Tab');
  await expect.poll(() => writer.evaluate((element: any) => element.value)).toContain('\\sqrt{x+1}');

  await palette.getByRole('tab', { name: 'Calculus', exact: true }).click();
  await palette.getByRole('button', { name: 'Insert Definite integral' }).click();
  await expect.poll(() => writer.evaluate((element: any) => element.value)).toContain('\\int_');

  await palette.getByRole('tab', { name: 'Linear algebra' }).click();
  await palette.getByRole('button', { name: 'Insert 2 by 2 matrix' }).click();
  await expect.poll(() => writer.evaluate((element: any) => element.value)).toContain('\\begin{pmatrix}');
  await page.getByRole('button', { name: 'Close symbol palette' }).click();
  await writer.press('Enter');
  await expect(page.locator('math-field.math-editor')).toHaveCount(1);
});

test('Pen draws with an ordinary mouse or trackpad pointer and geometry strokes persist', async ({ page }) => {
  await page.goto('/');
  await writeTextLine(page, 'Eraser must protect this typed note.');
  await writeMathLine(page, String.raw`x^2+1`);
  await page.getByRole('button', { name: 'Draw on page' }).click();
  const canvas = page.getByLabel('Page drawing canvas');
  const toolbar = page.getByRole('complementary', { name: 'Drawing tools' });
  await expect(canvas).toBeVisible();
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Drawing canvas has no visible bounds');
  // Playwright mouse is an ordinary mouse pointer. This is the mandatory laptop trackpad/mouse path.
  await page.mouse.move(bounds.x + 180, bounds.y + 170);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 230, bounds.y + 190, { steps: 8 });
  await page.mouse.move(bounds.x + 280, bounds.y + 160, { steps: 8 });
  await page.mouse.up();
  const savedMarks = canvas.locator('.page-drawing-layer__marks [data-drawing-id]');
  await expect(savedMarks).toHaveCount(1);

  // Closing controls does not exit Draw. The dock button reopens them, and
  // arbitrary native-picker colors are retained for the next mouse stroke.
  await toolbar.getByRole('button', { name: 'Close drawing tools' }).click();
  await expect(toolbar).toBeHidden();
  await page.mouse.move(bounds.x + 120, bounds.y + 250);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 190, bounds.y + 265, { steps: 6 });
  await page.mouse.up();
  await expect(savedMarks).toHaveCount(2);
  await page.getByRole('button', { name: 'Draw on page' }).click();
  await expect(toolbar).toBeVisible();
  await toolbar.getByLabel('Custom pen color').fill('#12a4c7');
  await page.mouse.move(bounds.x + 120, bounds.y + 300);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 220, bounds.y + 315, { steps: 6 });
  await page.mouse.up();
  await expect(savedMarks.last()).toHaveAttribute('stroke', '#12a4c7');

  await toolbar.getByRole('button', { name: 'Rectangle' }).click();
  await toolbar.getByRole('button', { name: 'Use color #a33d32' }).click();
  await toolbar.getByLabel('Pen nib width').fill('6');
  await page.mouse.move(bounds.x + 320, bounds.y + 230);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 470, bounds.y + 330, { steps: 5 });
  await page.mouse.up();

  await toolbar.getByRole('button', { name: 'Circle or ellipse' }).click();
  await page.mouse.move(bounds.x + 520, bounds.y + 230);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 640, bounds.y + 350, { steps: 5 });
  await page.mouse.up();

  await toolbar.getByRole('button', { name: 'Perpendicular lines' }).click();
  await page.mouse.move(bounds.x + 240, bounds.y + 420);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 410, bounds.y + 460, { steps: 5 });
  await page.mouse.up();
  await expect(savedMarks).toHaveCount(6);

  await toolbar.getByRole('button', { name: 'Undo stroke' }).click();
  await expect(savedMarks).toHaveCount(5);
  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel('Saved page drawings').locator('.page-drawing-layer__marks [data-drawing-id]')).toHaveCount(5);

  // Erasing is also an ordinary mouse/trackpad gesture. One drag is committed
  // as one history action and cannot touch text, math, or the ruled paper.
  await page.getByRole('button', { name: 'Draw on page' }).click();
  const activeCanvas = page.getByLabel('Page drawing canvas');
  const activeToolbar = page.getByRole('complementary', { name: 'Drawing tools' });
  await activeToolbar.getByRole('button', { name: 'Eraser', exact: true }).click();
  await activeToolbar.getByRole('button', { name: 'Small', exact: true }).click();
  const eraserSlider = activeToolbar.getByRole('slider', { name: 'Eraser size' });
  await expect(eraserSlider).toHaveValue('14');
  await eraserSlider.fill('52');
  await expect(eraserSlider).toHaveValue('52');
  const eraseBounds = await activeCanvas.boundingBox();
  if (!eraseBounds) throw new Error('Eraser canvas has no visible bounds');
  await page.mouse.move(eraseBounds.x + 155, eraseBounds.y + 150);
  await expect(activeCanvas.locator('.page-eraser-cursor')).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(eraseBounds.x + 300, eraseBounds.y + 205, { steps: 12 });
  await page.mouse.up();
  await expect(activeCanvas.locator('.page-drawing-layer__marks [data-drawing-id]')).toHaveCount(5);
  await expect(activeCanvas.locator('mask path')).toHaveCount(1);
  await expect(page.getByTestId('page-object-text')).toHaveCount(1);
  await expect(page.getByTestId('page-object-math')).toHaveCount(1);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(activeCanvas.locator('.page-drawing-layer__marks [data-drawing-id]')).toHaveCount(5);
  await expect(activeCanvas.locator('mask path')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(activeCanvas.locator('.page-drawing-layer__marks [data-drawing-id]')).toHaveCount(5);
  await expect(activeCanvas.locator('mask path')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel('Saved page drawings').locator('.page-drawing-layer__marks [data-drawing-id]')).toHaveCount(5);
  await expect(page.getByLabel('Saved page drawings').locator('mask path')).toHaveCount(1);
});

test('integrals calculate from structured lines and notebook operations remain available', async ({ page }) => {
  await page.goto('/');
  const field = await writeMathLine(page, String.raw`\int_0^2 x\,dx`);
  await field.click();
  await page.getByRole('button', { name: 'Solve integral' }).click();
  await expect(page.getByLabel('Integral value')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('Integral value')).toContainText('2');

  await page.getByRole('button', { name: '+ Add page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
});

test('voice, research tools, and floating calculator remain available', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Voice writing' }).click();
  await expect(page.getByTestId('voice-panel')).toBeVisible();
  await page.getByTestId('voice-panel').getByText('What can I say?', { exact: true }).click();
  await expect(page.getByTestId('voice-panel')).toContainText('x equals six, then y equals eight');
  await page.getByTestId('voice-panel').getByRole('button', { name: 'Close voice input' }).click();

  await page.getByRole('button', { name: 'Open graph and research workspace' }).click();
  const research = page.getByTestId('research-tools-panel');
  await expect(research).toBeVisible();
  await expect(research.getByLabel('Interactive 2D graph')).toBeVisible();
  await expect(research.getByLabel('Expression 1', { exact: true })).toHaveCount(0);
  await research.getByRole('button', { name: '+ Add expression' }).click();
  const researchExpression = research.getByLabel('Expression 1', { exact: true });
  await researchExpression.fill('y=sin(x)');
  const graph2d = research.getByLabel('Interactive 2D graph');
  await expect.poll(() => graph2d.evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 125 && pixels[index] < 185 && pixels[index + 1] > 45 && pixels[index + 1] < 105 && pixels[index + 2] < 80) colored += 1;
    }
    return colored;
  })).toBeGreaterThan(40);
  await researchExpression.click();
  await research.getByRole('button', { name: 'Ω Symbols' }).click();
  const researchPalette = page.getByTestId('math-palette');
  await expect(researchPalette).toBeVisible();
  await researchPalette.getByRole('tab', { name: 'Calculus', exact: true }).click();
  await researchPalette.getByRole('button', { name: 'Insert Integral' }).click();
  await expect.poll(() => researchExpression.evaluate((element: any) => element.value)).toContain('\\int');
  await researchPalette.getByRole('button', { name: 'Close symbol palette' }).click();
  await researchExpression.evaluate((element: any) => {
    element.value = String.raw`y=\sin(x)`;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
  });
  const researchInsert = research.getByRole('button', { name: '☰ Insert structures' });
  await researchInsert.click();
  await expect(page.getByRole('menu')).toBeVisible();
  const researchInsertBox = await researchInsert.boundingBox();
  expect(researchInsertBox).not.toBeNull();
  await page.mouse.click(
    researchInsertBox!.x + researchInsertBox!.width / 2,
    researchInsertBox!.y + researchInsertBox!.height / 2,
  );
  await expect(page.getByRole('menu')).toBeHidden();
  await research.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await research.getByLabel('Graph calculus function').selectOption('1');
  await research.getByRole('button', { name: 'Measure definite integral' }).click();
  await expect(research.getByLabel('Graph calculus measurements')).toContainText('Integral');

  await research.getByRole('button', { name: '+ Add expression' }).click();
  const integralExpression = research.getByLabel('Expression 2', { exact: true });
  await integralExpression.evaluate((element: any) => {
    element.value = String.raw`\int_{0}^{1}x\,dx`;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
  });
  await expect.poll(() => research.getByLabel('Research expression result').evaluate((element: any) => element.value)).toBe(String.raw`\frac{1}{2}`);
  await expect.poll(() => graph2d.evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 125 && pixels[index] < 185 && pixels[index + 1] > 45 && pixels[index + 1] < 105 && pixels[index + 2] < 80) colored += 1;
    return colored;
  })).toBeGreaterThan(40);

  await research.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(research.getByLabel('2D Graph guide complete supported features')).toContainText('Measure from graph');

  await research.getByRole('button', { name: '3D Surface', exact: true }).click();
  await expect(research.getByLabel('Interactive 3D graph')).toBeVisible();
  await expect(research.getByLabel('3D surface expression 1')).toHaveCount(0);
  const blank3D = await research.getByLabel('Interactive 3D graph').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await research.getByRole('button', { name: '+ Add surface' }).click();
  await research.getByRole('button', { name: '+ Add slider' }).click();
  await research.getByLabel('3D surface expression 1').evaluate((element: any) => {
    element.value = String.raw`\sin(x)\cos(y)e^{a x}`;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
  });
  await expect.poll(() => research.getByLabel('Interactive 3D graph').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(blank3D);
  await expect(research.getByText(/Surface 1: check/)).toHaveCount(0);
  await research.getByRole('button', { name: 'Zoom 3D view in' }).click();
  await research.getByLabel('Double or triple integral integrand').fill('x*y');
  await research.getByRole('button', { name: 'Calculate numerical double integral' }).click();
  await expect(research.getByLabel('2D and 3D numerical integration')).toContainText('0.25');
  await research.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(research.getByLabel('3D Surface guide complete supported features')).toContainText('triple numerical integral');

  await research.getByRole('button', { name: 'Geometry', exact: true }).click();
  await expect(research.getByLabel('Interactive geometry canvas')).toBeVisible();
  await research.getByLabel('Geometry construction expression').fill('circle((0,0),3)');
  await research.getByLabel('Geometry construction expression').press('Enter');
  await expect(research.getByLabel('Geometry objects', { exact: true })).toContainText('Circle');
  await research.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(research.getByLabel('2D Geometry guide complete supported features')).toContainText('Perpendicular');

  await research.getByRole('button', { name: '3D Geometry', exact: true }).click();
  await expect(research.getByLabel('Interactive 3D geometry canvas')).toBeVisible();
  await research.getByLabel('3D geometry construction expression').fill('point(1,2,3)');
  await research.getByLabel('3D geometry construction expression').press('Enter');
  await expect(research.getByText('Point created.')).toBeVisible();
  await research.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(research.getByLabel('3D Geometry guide complete supported features')).toContainText('sphere(A,r)');
  await research.getByRole('button', { name: '3D Geometry', exact: true }).click();
  await research.getByRole('button', { name: 'Copy to notebook' }).click();
  await expect(research.getByRole('dialog', { name: 'Copy research to notebook' })).toBeVisible();
  await research.getByRole('button', { name: 'Copy and open page' }).click();
  await expect(research).toBeHidden();
  const researchCard = page.locator('.research-object-card');
  await expect(researchCard).toBeVisible();
  await researchCard.dblclick();
  await expect(research).toContainText('Edit page research copy');
  await research.getByRole('button', { name: 'Save page copy' }).click();
  await expect(research).toContainText('Page copy preview saved.');
  await research.getByRole('button', { name: 'Close research tools' }).click();

  await page.getByRole('button', { name: 'Toggle floating calculator' }).click();
  const calculator = page.getByTestId('floating-calculator');
  await calculator.getByLabel('Calculator expression').fill('6*4');
  await calculator.getByLabel('Calculator expression').press('Enter');
  await expect(calculator).toContainText('24');
});

test('new research workspaces and Reset all contain no sample equations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open graph and research workspace' }).click();
  const research = page.getByTestId('research-tools-panel');
  await expect(research.getByLabel('Expression 1', { exact: true })).toHaveCount(0);
  await research.getByRole('button', { name: '+ Add expression' }).click();
  await research.getByLabel('Expression 1', { exact: true }).fill('y=x^2');
  await research.getByRole('button', { name: '3D Surface', exact: true }).click();
  await expect(research.getByLabel('3D surface expression 1')).toHaveCount(0);
  await research.getByRole('button', { name: '+ Add surface' }).click();
  await research.getByLabel('3D surface expression 1').fill('x*y');

  page.once('dialog', (dialog) => dialog.accept());
  await research.getByRole('button', { name: 'Reset all', exact: true }).click();
  await expect(research).toContainText('All research sections reset.');
  await expect(research.getByLabel('3D surface expression 1')).toHaveCount(0);
  await research.getByRole('button', { name: '2D Graph', exact: true }).click();
  await expect(research.getByLabel('Expression 1', { exact: true })).toHaveCount(0);
  await research.getByRole('button', { name: 'Scientific', exact: true }).click();
  await expect.poll(() => research.getByLabel('Scientific expression').evaluate((element: any) => element.value)).toBe('');
});

test('page selection manages favorites, highlights, printing, deletion, and undo without reordering', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Add page' }).click();
  await page.getByRole('button', { name: '+ Add page' }).click();
  await expect(page.getByText('Page 3 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Select pages' }).click();
  await page.getByLabel('Select page 1').check();
  await page.getByLabel('Select page 3').check();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: /Favorite/ }).click();
  await page.getByLabel('Page highlight color').fill('#ffd966');
  await expect(page.locator('.thumbnail-favorite')).toHaveCount(2);
  await page.evaluate(() => { (window as typeof window & { __printed?: boolean }).__printed = false; window.print = () => { (window as typeof window & { __printed?: boolean }).__printed = true; }; });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __printed?: boolean }).__printed)).toBe(true);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText(/Page \d of 3/)).toBeVisible();
  await expect(page.locator('.thumbnail-favorite')).toHaveCount(2);
});

test('page remains viewport-safe at laptop and narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 659 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open writing and math controls' }).click();
  await expect(page.getByLabel('Writing and mathematics tools')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);

  await page.getByRole('button', { name: 'Notebook menu' }).click();
  const menu = page.getByRole('menu');
  const menuBox = await menu.boundingBox();
  expect(menuBox?.x ?? 1281).toBeGreaterThanOrEqual(0);
  expect((menuBox?.x ?? 0) + (menuBox?.width ?? 1281)).toBeLessThanOrEqual(1280);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.setViewportSize({ width: 760, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(760);
  await expect(page.getByRole('button', { name: 'Draw on page' })).toBeVisible();
});

test('text typography persists and print layout maps one selected page to one A4 sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Notebook menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Print / Save PDF…' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Open writing and math controls' }).click();
  await page.getByLabel('Text font style').selectOption('roman');
  await page.getByLabel('Text size').selectOption('20');
  await page.getByLabel('Bold text').click();
  await page.getByLabel('Italic text').click();
  await page.getByLabel('Text color', { exact: true }).fill('#1d4f91');
  const writer = page.getByLabel('Write on this ruled line');
  await writer.fill('Styled Roman note');
  await writer.press('Enter');
  const note = page.locator('textarea[aria-label="Text note"]').last();
  await expect(note).toBeVisible();
  await expect(note).toHaveCSS('font-family', /Georgia/);
  await expect(note).toHaveCSS('font-weight', '700');
  await expect(note).toHaveCSS('font-style', 'italic');
  await expect(note).toHaveCSS('color', 'rgb(29, 79, 145)');
  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible();
  await page.reload();
  await expect(page.locator('textarea[aria-label="Text note"]').last()).toHaveCSS('font-style', 'italic');

  await page.getByRole('button', { name: '+ Add page' }).click();
  await page.getByRole('button', { name: '+ Add page' }).click();
  await page.getByRole('button', { name: '+ Add page' }).click();
  await page.getByRole('button', { name: 'Select pages' }).click();
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.evaluate(() => { window.print = () => undefined; });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.locator('.printable-page')).toHaveCount(4);
  await page.emulateMedia({ media: 'print' });
  const boxes = await page.locator('.printable-page').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, breakAfter: getComputedStyle(element).breakAfter };
  }));
  expect(boxes).toHaveLength(4);
  boxes.forEach((box) => {
    expect(box.height / box.width).toBeCloseTo(297 / 210, 2);
    expect(box.breakAfter).toMatch(/page|auto/);
  });
});

test('3D Geometry object gallery creates and edits actual solids', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open graph and research workspace' }).click();
  const research = page.getByTestId('research-tools-panel');
  await research.getByRole('button', { name: '3D Geometry', exact: true }).click();
  const canvas = research.getByLabel('Interactive 3D geometry canvas');
  const blank = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await research.getByRole('button', { name: 'Cube', exact: true }).click();
  await expect(research.getByLabel('3D geometry objects')).toContainText('cube');
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(blank);
  await expect(research.getByText(/volume 8\.0000/)).toBeVisible();
  await research.getByRole('button', { name: 'Ellipsoid', exact: true }).click();
  await expect(research.getByLabel('3D geometry objects')).toContainText('ellipsoid');
  await expect(research.getByLabel('X size')).toBeVisible();
  await research.getByLabel('X size').fill('3');
  await expect(research.getByText(/semi-axes 3\.00/)).toBeVisible();
  await research.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(research.getByLabel('3D Geometry guide complete supported features')).toContainText('paraboloid');
});
