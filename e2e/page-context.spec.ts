import { expect, test } from '@playwright/test';

for (const mode of ['Auto text + math', 'Math only', 'Text only'] as const) {
  test(`${mode}: unfinished writing reaches the outline and the AION request`, async ({ page }) => {
    const requests: string[] = [];
    await page.route('**/api/tags', (route) => route.fulfill({ json: { models: [{ name: 'qwen3:8b' }] } }));
    await page.route('**/api/assistant', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { ready: true } });
      } else {
        requests.push(route.request().postDataJSON().prompt);
        await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"response":"Page received."}\n\ndata: [DONE]\n\n' });
      }
    });
    await page.goto('/');
    await expect(page.getByTestId('notebook-page')).toBeVisible();
    await page.getByRole('button', { name: 'Open writing and math controls' }).click();
    await page.getByRole('button', { name: mode, exact: true }).click();

    async function writeWithoutEnter(value: string) {
      if (mode === 'Math only') {
        await page.locator('math-field.line-math-composer').evaluate((element, latex) => {
          (element as HTMLElement & { value: string }).value = latex;
          element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        }, value);
      } else {
        await page.getByLabel('Write on this ruled line', { exact: true }).fill(value);
      }
    }

    await writeWithoutEnter('x^2=4');
    await expect(page.getByRole('button', { name: 'Open page assistant with 1 problem groups' })).toBeVisible();
    await page.getByRole('button', { name: 'Open page assistant with 1 problem groups' }).click();
    await page.getByRole('button', { name: /Page outline/ }).click();
    await expect(page.locator('.page-problem')).toHaveCount(1);
    await expect(page.locator('.page-problem__heading')).toContainText('Separate question');
    await expect(page.getByTestId(mode === 'Text only' ? 'page-object-text' : 'page-object-math')).toHaveCount(1);

    // Same draft IDs, different text: the visible outline must refresh on edits.
    await writeWithoutEnter('z^2=9');
    await expect(page.locator('.page-problem')).toHaveCount(mode === 'Text only' ? 1 : 2);
    await writeWithoutEnter('z^2=16');
    if (mode === 'Text only') {
      await expect(page.locator('.page-problem').last()).toContainText('z^2=16');
    } else {
      await expect.poll(() => page.locator('.page-problem').last().locator('math-field').evaluate((element) =>
        (element as HTMLElement & { value: string }).value)).toContain('16');
    }

    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await page.getByRole('radio', { name: 'Fast online' }).click();
    await page.getByLabel('Ask AION about this page').fill('Solve the problems I wrote on my page.');
    await page.getByRole('button', { name: 'Send question to AION' }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toContain('x^2=4');
    expect(requests[0]).toContain('z^2=16');
    expect(requests[0]).not.toContain('z^2=9');
    expect(requests[0]).not.toContain('(blank page)');
    await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId(mode === 'Text only' ? 'page-object-text' : 'page-object-math')).toHaveCount(2);
    await page.getByRole('button', { name: /Page outline/ }).click();
    await expect(page.locator('.page-problem')).toHaveCount(mode === 'Text only' ? 1 : 2);
  });
}

test('changing pages saves the unfinished line on its original page and supports undo', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Write on this ruled line', { exact: true }).fill('x^2=25');
  await page.getByRole('button', { name: '+ Add page', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open page assistant with 0 problem groups' })).toBeVisible();
  await expect(page.getByLabel('Write on this ruled line', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Open page 1', exact: true }).click();
  await expect(page.getByTestId('page-object-math')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open page assistant with 1 problem groups' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('page-object-math')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('page-object-math')).toHaveCount(1);
});
