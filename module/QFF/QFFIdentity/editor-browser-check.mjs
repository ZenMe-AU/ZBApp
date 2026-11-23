/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
import assert from "node:assert/strict";

// Runs only inside browser-check.mjs's disposable repository and local provider.
export async function checkEditorRegressions(page, backend) {
  const id = new URL(page.url()).searchParams.get('profile');
  const url = `${backend}/api/v1/profiles/${id}`;
  const read = async () => (await (await fetch(url)).json());
  const count = async () => (await read()).profile.properties.preferences.length;
  const search = page.locator('#search');
  const form = page.locator('#preference-form');
  const title = form.getByRole('textbox', { name: 'Title', exact: true });
  const description = form.getByRole('textbox', { name: 'Description', exact: true });
  const save = page.getByRole('button', { name: 'Save preference', exact: true });
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  const confirmation = page.locator('#confirm-dialog');
  let requests = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith(`/profiles/${id}/preferences`)) requests++; });

  await search.fill('  pAGINATION check 198  ');
  assert.equal(await page.locator('.preference-row').count(), 1);
  assert.equal(await page.locator('[data-filter="all"] span').innerText(), '1');
  assert.equal(await page.locator('.list-pagination>span').innerText(), '1–1 of 1 preference');
  await search.fill(''); await page.locator('[data-filter="boundary"]').click();
  assert.equal(await page.getByRole('heading', { name: 'No boundaries yet' }).isVisible(), true);
  assert.equal(await page.getByText('Try a different search or context.', { exact: true }).count(), 0);
  await page.locator('[data-filter="want"]').click();
  assert.equal(await page.locator('.category').innerText(), 'Wants & goals');
  await page.locator('[data-filter="all"]').click();
  const initial = (await read()).profile.properties.preferences;
  const identityWide = initial.filter(p => p.personas.some(a => a.persona === '')).length;
  const unset = initial.filter(p => !p.personas.length).length;
  await page.locator('#context-filter').selectOption('');
  assert.equal(await page.locator('.preference-row').count(), identityWide);
  assert.equal(await page.locator('.affinity-empty').count(), 0);
  await page.getByRole('button', { name: 'Contexts', exact: true }).click();
  assert.match(await page.locator('[data-context=""]').innerText(), new RegExp(`${identityWide} preferences`));
  assert.match(await page.locator('[data-context="__qff_unassigned__"]').innerText(), new RegExp(`${unset} preferences`));
  await page.locator('[data-context="__qff_unassigned__"]').click();
  assert.equal(await page.locator('.preference-row .affinity-meter').count(), 0);
  assert.equal(await page.locator('.preference-row').count(), await page.locator('.affinity-empty').count());
  await page.locator('#context-filter').selectOption('all');

  await page.getByRole('button', { name: 'Add preference', exact: true }).click();
  await title.fill('   '); await description.fill('\n');
  const beforeValidation = requests;
  await save.click();
  assert.equal(await title.getAttribute('aria-invalid'), 'true');
  assert.equal(await description.getAttribute('aria-invalid'), 'true');
  assert.equal(await title.evaluate(el => document.activeElement === el), true);
  assert.equal(requests, beforeValidation, 'Whitespace is rejected before an API call');
  await title.fill('Audit choice'); await description.fill('A preference chosen during this isolated check.');
  await form.locator('[name="persona"]').fill(' Work ');
  await page.getByRole('button', { name: 'Add context', exact: true }).click();
  await form.locator('[name="persona"]').last().fill('work'); await save.click();
  assert.equal(await form.locator('[name="persona"][aria-invalid="true"]').count(), 2);
  assert.equal(requests, beforeValidation);
  await cancel.focus(); await page.keyboard.press('Enter');
  await confirmation.waitFor({ state: 'visible' });
  assert.equal(await confirmation.getByRole('button', { name: 'Keep editing' }).evaluate(el => el === document.activeElement), true);
  for (let n = 0; n < 4; n++) { await page.keyboard.press('Tab'); assert.equal(await confirmation.evaluate(el => el.contains(document.activeElement)), true); }
  await page.keyboard.press('Escape');
  assert.equal(await title.inputValue(), 'Audit choice');
  assert.equal(await cancel.evaluate(el => el === document.activeElement), true);
  await cancel.click(); await confirmation.getByRole('button', { name: 'Discard changes' }).click();
  await page.waitForFunction(() => document.querySelector('#preference-editor').hidden);
  assert.equal(await page.locator('#notice').innerText(), 'Ready.');

  await page.getByLabel('Preferences per page').selectOption('10');
  await page.getByRole('button', { name: 'Add preference', exact: true }).click();
  await title.fill('Audit choice'); await description.fill('A preference chosen during this isolated check.');
  await form.locator('[name="persona"]').fill('Technology Peer');
  for (const width of [1024, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await form.locator('[name="persona"]').evaluate(el => {
      const style = getComputedStyle(el), canvas = document.createElement('canvas').getContext('2d'); canvas.font = style.font;
      return canvas.measureText(el.value).width <= el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    }), true, `Context is readable at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await form.locator('[data-action="remove-context"]').click();
  assert.equal(await page.locator('.affinity-key').isHidden(), true);
  await page.getByText('No Context or Affinity is set. Add a context to set one.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add context', exact: true }).click();
  assert.equal(await page.locator('.affinity-key').isVisible(), true);
  const beforeSave = await count();
  await save.click(); await page.getByText('Preference saved.', { exact: true }).waitFor();
  const saved = (await read()).profile.properties.preferences.find(p => p.keyword === 'Audit choice');
  assert.equal(await count(), beforeSave + 1);
  await page.waitForFunction(() => document.activeElement?.closest('.preference-row')?.classList.contains('is-saved'));
  assert.equal(await page.locator('.preference-row.is-saved strong').innerText(), 'Audit choice');
  assert.match(await page.locator('.page-navigation').innerText(), new RegExp(`Page ${Math.ceil((beforeSave + 1) / 10)} of`));

  await page.getByRole('button', { name: 'Add preference', exact: true }).click();
  await title.fill('  AUDIT CHOICE  '); await description.fill('Another description');
  const beforeDuplicate = requests; await save.click();
  assert.equal(await title.getAttribute('aria-invalid'), 'true'); assert.equal(requests, beforeDuplicate);
  const snapshot = await read();
  const rejected = await fetch(`${url}/preferences`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': snapshot.revision }, body: JSON.stringify({ keyword: 'AUDIT CHOICE', definition: 'Different wording', kind: 'interest', personas: [{ persona: '', affinity: 1 }] }) });
  assert.equal(rejected.status, 409); assert((await rejected.json()).fields.keyword); assert.equal(await count(), beforeSave + 1);
  await title.fill('Another audit choice');
  await page.route(`**/profiles/${id}/preferences`, route => route.fulfill({ status: 400, json: { error: 'Review the Description.', fields: { definition: 'Review the Description.' } } }), { times: 1 });
  await save.click(); await form.locator('.field-error').filter({ hasText: 'Review the Description.' }).waitFor();
  assert.equal(await description.evaluate(el => el === document.activeElement), true);
  assert.equal(await title.inputValue(), 'Another audit choice');
  await cancel.click(); await confirmation.getByRole('button', { name: 'Discard changes' }).click();
  await page.waitForFunction(() => document.querySelector('#preference-editor').hidden);
  assert.equal(await page.locator('#notice').innerText(), 'Ready.');
  await page.getByRole('button', { name: 'Edit Audit choice', exact: true }).click();
  await page.getByRole('button', { name: 'Delete preference', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete “Audit choice”?' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Delete preference', exact: true }).evaluate(el => el === document.activeElement), true);
  assert((await read()).profile.properties.preferences.some(p => p.preference_id === saved.preference_id));
  await cancel.click();
  await page.locator('[data-action="open-profiles"]').click();
  await page.getByRole('dialog', { name: 'Open a profile' }).waitFor();
  assert.equal(await page.locator('#profile-select').inputValue(), id);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await page.getByLabel('Age', { exact: true }).fill('151');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByText('Age must be between 0 and 150.', { exact: true }).waitFor();
  await page.locator('[name="age"]').fill('25');
  for (let n = 0; n < 2; n++) await page.getByRole('button', { name: 'Add personal detail' }).click();
  await page.locator('.detail-row').first().getByRole('button', { name: 'Remove personal detail' }).click();
  await page.locator('[name="detail-label"]').fill('My detail');
  await page.locator('[name="detail-value"]').fill('My own information');
  await page.getByRole('button', { name: 'Add personal detail' }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  assert.equal(await page.locator('.detail-row').first().locator('[aria-invalid="true"]').count(), 0);
  assert.equal(await page.locator('.detail-row').last().locator('[aria-invalid="true"]').count(), 2);
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Discard changes' }).click();
  await page.locator('#search').waitFor();
}
