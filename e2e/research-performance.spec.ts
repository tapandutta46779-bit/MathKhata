import { expect, test } from '@playwright/test';

test('dense research scenes remain editable and interactive', async ({ page }) => {
  test.setTimeout(60_000);
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('notebook-page')).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = '/src/store/notebookStore.ts';
    const { useNotebookStore } = await import(modulePath);
    const store = useNotebookStore.getState();
    const colors = ['#9d482b', '#3777a5', '#6c8f4d', '#8e5aa4', '#c78428', '#ad4778'];
    store.updateResearchValue('3d:resolution', 45);
    store.updateResearchValue('3d:surfaces', Array.from({ length: 6 }, (_, i) => ({
      id: i + 1, expression: `sin(x+${i})*cos(y)+x^2/10`, color: colors[i], opacity: .65, visible: true,
    })));
    store.updateResearchValue('3d:implicit-surfaces', Array.from({ length: 3 }, (_, i) => ({
      id: i + 10, expression: `x^2+y^2+z^2-${i + 3}`, color: colors[i], opacity: .5, visible: true,
    })));
    for (const section of ['2d', 'loglog']) store.updateResearchValue(`${section}:expressions`, Array.from({ length: 12 }, (_, i) => ({
      id: i + 1, expression: section === '2d' ? `y=sin(x+${i})+${i / 4}` : `y=${i + 1}*x^${1 + i / 10}`,
      color: colors[i % colors.length], visible: true,
    })));
    store.updateResearchValue('geometry:points', Array.from({ length: 40 }, (_, i) => ({ id: i + 1, x: (i % 8) - 4, y: Math.floor(i / 8) - 2, label: `P${i}` })));
    store.updateResearchValue('geometry:objects', Array.from({ length: 35 }, (_, i) => ({ id: i + 1, type: i % 3 === 0 ? 'circle' : 'segment', points: [i + 1, (i + 9) % 40 + 1], color: colors[i % 6], visible: true })));
    store.updateResearchValue('geometry3d:points', Array.from({ length: 30 }, (_, i) => ({ id: i + 1, x: (i % 6) - 3, y: Math.floor(i / 6) - 2, z: i % 3 - 1, label: `P${i}`, color: colors[i % 6], visible: true })));
    store.updateResearchValue('geometry3d:objects', Array.from({ length: 30 }, (_, i) => ({ id: i + 1, type: 'solid', primitive: i % 2 ? 'sphere' : 'cube', center: i + 1, dimensions: [.6, .6, .6], label: `Solid ${i}`, color: colors[i % 6], visible: true })));
  });
  await page.getByRole('button', { name: 'Open graph and research workspace' }).click();
  const research = page.getByTestId('research-tools-panel');
  for (const [tab, label] of [['3D Surface', 'Interactive 3D graph'], ['2D Graph', 'Interactive 2D graph'], ['Log-Log Graph', 'Interactive log-log graph'], ['Geometry', 'Interactive geometry canvas'], ['3D Geometry', 'Interactive 3D geometry canvas']]) {
    await research.getByRole('button', { name: tab, exact: true }).click();
    const canvas = research.getByLabel(label, { exact: true });
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 45) count++;
      return count;
    })).toBeGreaterThan(tab === '3D Surface' ? 5000 : 300);
    await expect(research.locator('.graph-error')).toHaveCount(0);
    await page.evaluate(() => {
      const state = window as any;
      state.lags = []; state.lastHeartbeat = performance.now();
      state.heartbeat = setInterval(() => { const now = performance.now(); state.lags.push(now - state.lastHeartbeat); state.lastHeartbeat = now; }, 16);
    });
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * .7, box.y + box.height * .25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .8, box.y + box.height * .4, { steps: 20 });
    await page.mouse.up();
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(300);
    const lag = await page.evaluate(() => { const state = window as any; clearInterval(state.heartbeat); return Math.max(...state.lags); });
    console.info(`${tab} maximum heartbeat interval: ${lag.toFixed(1)} ms`);
    expect(lag).toBeLessThan(500);
  }
  const closeStart = Date.now();
  await research.getByRole('button', { name: 'Close research tools' }).click();
  await expect(research).toBeHidden();
  expect(Date.now() - closeStart).toBeLessThan(1500);
  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open graph and research workspace' }).click();
  await research.getByRole('button', { name: '3D Surface', exact: true }).click();
  await expect(research.getByLabel('3D surface expression 6', { exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});

test('background scientific calculation preserves answers and angle mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open graph and research workspace' }).click();
  const research = page.getByTestId('research-tools-panel');
  await research.getByRole('button', { name: 'Scientific', exact: true }).click();
  await research.getByRole('radio', { name: 'DEG', exact: true }).click();
  await research.getByLabel('Scientific expression', { exact: true }).evaluate((element: any) => {
    element.value = '\\sin(30)'; element.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await research.getByRole('button', { name: 'Enter ↵', exact: true }).click();
  await expect(research.locator('.scientific-history-row')).toContainText('0.5');
  await research.getByLabel('Scientific expression', { exact: true }).evaluate((element: any) => {
    element.value = '\\int_0^1 x\\,dx'; element.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await research.getByRole('button', { name: 'Enter ↵', exact: true }).click();
  await expect(research.locator('.scientific-history-row')).toHaveCount(2);
  await expect(research.locator('.scientific-history-row').last()).toContainText('0.5');
});
