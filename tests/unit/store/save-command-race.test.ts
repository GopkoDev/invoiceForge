// editor-ux T13 (RED) — the store's save command: a form revision counter and every save outcome
// resolved inside the command (ADR-0005; spec AC-03, AC-04, AC-05, AC-05b; sad §10 QG-1).
// Store-level: createInvoiceEditorStore + a controllable fake server action.
//
// The API these tests pin (not yet in production code):
//   state.revision: number                               - +1 on every form-mutating action
//   state.save(intent: 'save' | 'save-and-issue', opts?: { confirmedTotals?: TotalsChanged }): Promise<void>
//   state.issuedEditsDroppedNotice: string | null        - the dismissable "not saved because issued" notice
//   state.dismissIssuedEditsDroppedNotice(): void
// Dialog state keeps using the existing `changedElsewhere` (SCR-10) and `totalsChanged` (SCR-09).
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { InvoiceEditorData, InvoiceFormItem } from '@/types/invoice/types';
import type { SavedInvoice } from '@/lib/actions/invoice-actions/invoice-actions';
import { ok, fail } from '@/types/actions';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';

const createInvoiceMock = vi.fn();
const updateInvoiceMock = vi.fn();

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  getInvoiceEditorData: vi.fn(),
  createInvoice: (...args: unknown[]) => createInvoiceMock(...args),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

const { createInvoiceEditorStore } = await import(
  '@/store/invoice-editor-store/create-invoice-editor-store'
);
const { emptyEditorData } = await import('../../support/render-with-editor-store');

type Store = ReturnType<typeof createInvoiceEditorStore>;
// The command and its new state, typed locally so this file compiles-by-shape until T13 lands.
type SaveState = {
  revision: number;
  save: (
    intent: 'save' | 'save-and-issue',
    opts?: { confirmedTotals?: { oldTotal: string; newTotal: string } }
  ) => Promise<void>;
  issuedEditsDroppedNotice: string | null;
  dismissIssuedEditsDroppedNotice: () => void;
};
const cmd = (s: Store) => s.getState() as unknown as ReturnType<Store['getState']> & SaveState;

const line = (id: string, quantity: number, price = 10): InvoiceFormItem => ({
  id,
  productId: 'custom',
  productName: `Line ${id}`,
  description: '',
  unit: 'pcs',
  quantity,
  price,
  total: quantity * price,
});

function editorData(): InvoiceEditorData {
  const base = emptyEditorData();
  return {
    ...base,
    invoiceId: 'inv-1',
    version: 3,
    initialData: {
      ...base.initialData!,
      invoiceNumber: 'INV-0001',
      taxRate: 10,
      discount: 5,
      shipping: 2,
      items: [line('a', 2), line('b', 1, 7.5)],
    },
  } as InvoiceEditorData;
}

function saved(items: InvoiceFormItem[], overrides: Partial<SavedInvoice> = {}): SavedInvoice {
  const amounts = computeInvoiceAmounts({ items, discount: 5, shipping: 2, taxRate: 10 });
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-0001',
    version: 4,
    subtotal: Number(amounts.subtotal),
    taxAmount: Number(amounts.taxAmount),
    total: Number(amounts.total),
    status: 'DRAFT',
    derivedOverdue: false,
    paidAt: null,
    issueDate: '2026-03-11T00:00:00.000Z',
    dueDate: '2026-04-10T00:00:00.000Z',
    issuedDetails: null,
    ...overrides,
  } as SavedInvoice;
}

/** A fake server action the test resolves by hand, after injecting an edit. */
function deferredUpdate() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  updateInvoiceMock.mockReturnValueOnce(promise);
  return resolve;
}

function visibleAmounts(s: Store) {
  const st = s.getState();
  return computeInvoiceAmounts({
    items: st.formData.items,
    discount: st.formData.discount,
    shipping: st.formData.shipping,
    taxRate: st.formData.taxRate,
  });
}
function expectTotalsMatchVisibleLines(s: Store) {
  const st = s.getState();
  const a = visibleAmounts(s);
  expect([st.subtotal, st.taxAmount, st.total]).toEqual([
    Number(a.subtotal),
    Number(a.taxAmount),
    Number(a.total),
  ]);
}

let store: Store;
beforeEach(() => {
  createInvoiceMock.mockReset();
  updateInvoiceMock.mockReset();
  store = createInvoiceEditorStore(editorData());
});

describe('form revision', () => {
  it('increments on every edit, including one that restores the previous value', () => {
    const r0 = cmd(store).revision;
    expect(r0).toBe(0);
    store.getState().updateItem('a', { quantity: 3 });
    expect(cmd(store).revision).toBe(1);
    store.getState().updateItem('a', { quantity: 2 }); // back to the original value
    expect(cmd(store).revision).toBe(2);
    store.getState().updateField('notes', 'x');
    store.getState().addItem();
    store.getState().deleteItem('b');
    expect(cmd(store).revision).toBe(5);
  });
});

describe('save command - saved outcomes', () => {
  it('AC-04: no edit during the save shows the stored figures and marks the invoice saved', async () => {
    store.getState().updateItem('a', { quantity: 3 });
    updateInvoiceMock.mockResolvedValueOnce(ok(saved([line('a', 3), line('b', 1, 7.5)], { total: 999.99 })));
    await cmd(store).save('save');
    const st = store.getState();
    expect(st.hasUnsavedChanges).toBe(false);
    expect(st.total).toBe(999.99); // the stored figure, not recomputed
    expect(st.loadedVersion).toBe(4);
    expect(st.isSaving).toBe(false);
  });

  it('AC-03: a quantity changed during the save stays unsaved, totals add up the lines now, next save sends it', async () => {
    const resolve = deferredUpdate();
    const pending = cmd(store).save('save');
    store.getState().updateItem('a', { quantity: 5 });
    resolve(ok(saved([line('a', 2), line('b', 1, 7.5)], { total: 123.45 })));
    await pending;

    const st = store.getState();
    expect(st.hasUnsavedChanges).toBe(true);
    expect(st.formData.items.find((i) => i.id === 'a')?.quantity).toBe(5);
    expect(st.loadedVersion).toBe(4); // the new version is applied
    expect(st.total).not.toBe(123.45); // the stale stored figure is not shown
    expectTotalsMatchVisibleLines(store);

    updateInvoiceMock.mockResolvedValueOnce(ok(saved([line('a', 5), line('b', 1, 7.5)], { version: 5 })));
    await cmd(store).save('save');
    const [, payload] = updateInvoiceMock.mock.calls[1];
    expect(payload.items.find((i: InvoiceFormItem) => i.id === 'a').quantity).toBe(5);
    expect(payload.loadedVersion).toBe(4);
    expect(store.getState().hasUnsavedChanges).toBe(false);
  });

  it('AC-04: an edit that puts a value back as it was still leaves the invoice unsaved', async () => {
    const resolve = deferredUpdate();
    const pending = cmd(store).save('save');
    store.getState().updateItem('a', { quantity: 3 });
    store.getState().updateItem('a', { quantity: 2 });
    resolve(ok(saved(editorData().initialData!.items)));
    await pending;
    expect(store.getState().hasUnsavedChanges).toBe(true);
    expectTotalsMatchVisibleLines(store);
  });

  it('ignores a second submit while a save is running (one server call)', async () => {
    const resolve = deferredUpdate();
    const first = cmd(store).save('save');
    const second = cmd(store).save('save');
    resolve(ok(saved(editorData().initialData!.items)));
    await Promise.all([first, second]);
    expect(updateInvoiceMock).toHaveBeenCalledTimes(1);
    expect(createInvoiceMock).not.toHaveBeenCalled();
  });

  it('drops a result that resolves after the store was re-initialized (sessionToken guard)', async () => {
    const resolve = deferredUpdate();
    const pending = cmd(store).save('save');
    const other = { ...editorData(), invoiceId: 'inv-2', version: 9 };
    store.getState().initialize(other);
    resolve(ok(saved(editorData().initialData!.items, { id: 'inv-1', version: 4 })));
    await pending;
    expect(store.getState().invoiceId).toBe('inv-2');
    expect(store.getState().loadedVersion).toBe(9);
  });
});

describe('save command - refusals (AC-05)', () => {
  it('field-invalid refusal with an edit during the save: errors on fields, every change on screen, unsaved', async () => {
    const resolve = deferredUpdate();
    store.getState().updateField('discount', 1);
    const pending = cmd(store).save('save');
    store.getState().updateItem('a', { quantity: 4 });
    resolve(fail('VALIDATION', 'Invalid amounts.', { fieldErrors: { discount: ['Too high.'] } }));
    await pending;
    const st = store.getState();
    expect(st.fieldErrors?.discount).toEqual(['Too high.']);
    expect(st.formData.discount).toBe(1);
    expect(st.formData.items.find((i) => i.id === 'a')?.quantity).toBe(4);
    expect(st.hasUnsavedChanges).toBe(true);
    expect(st.loadedVersion).toBe(3); // nothing from the refused save is applied
    expectTotalsMatchVisibleLines(store);
  });

  it('changed-elsewhere refusal with an edit during the save: dialog state set, edits kept, unsaved', async () => {
    const resolve = deferredUpdate();
    const pending = cmd(store).save('save');
    store.getState().updateItem('a', { quantity: 4 });
    resolve(fail('CONFLICT', 'Changed elsewhere.', { details: { kind: 'CHANGED_ELSEWHERE' } as never }));
    await pending;
    const st = store.getState();
    expect(st.changedElsewhere).toBe('Changed elsewhere.');
    expect(st.formData.items.find((i) => i.id === 'a')?.quantity).toBe(4);
    expect(st.hasUnsavedChanges).toBe(true);
    expect(st.loadedVersion).toBe(3);
  });

  it('totals-changed refusal sets the confirmation state; confirming calls the same command with the figures', async () => {
    store.getState().updateItem('a', { quantity: 4 });
    updateInvoiceMock.mockResolvedValueOnce(
      fail('CONFLICT', 'Totals changed.', {
        details: { kind: 'TOTALS_CHANGED', oldTotal: '10.00', newTotal: '12.00' } as never,
      })
    );
    await cmd(store).save('save');
    expect(store.getState().totalsChanged).toEqual({ oldTotal: '10.00', newTotal: '12.00' });
    expect(store.getState().hasUnsavedChanges).toBe(true);

    updateInvoiceMock.mockResolvedValueOnce(ok(saved([line('a', 4), line('b', 1, 7.5)])));
    await cmd(store).save('save', { confirmedTotals: { oldTotal: '10.00', newTotal: '12.00' } });
    expect(updateInvoiceMock.mock.calls[1][1].confirmedTotals).toEqual({ oldTotal: '10.00', newTotal: '12.00' });
    expect(store.getState().totalsChanged).toBeNull();
    expect(store.getState().hasUnsavedChanges).toBe(false);
  });

  it('FAILED leaves the form unsaved and idle', async () => {
    store.getState().updateItem('a', { quantity: 4 });
    updateInvoiceMock.mockResolvedValueOnce(fail('FAILED', 'Error saving invoice.'));
    await cmd(store).save('save-and-issue');
    expect(store.getState().isSaving).toBe(false);
    expect(store.getState().hasUnsavedChanges).toBe(true);
    // the issue intent sent status PENDING while the form stays a draft
    expect(updateInvoiceMock.mock.calls[0][1].status).toBe('PENDING');
    expect(store.getState().formData.status).toBe('DRAFT');
  });
});

describe('save command - issued with edits (AC-05b)', () => {
  it('Save and issue with a quantity changed during it: issued lines kept, edit discarded, dismissable notice', async () => {
    const issuedItems = editorData().initialData!.items;
    const resolve = deferredUpdate();
    const pending = cmd(store).save('save-and-issue');
    store.getState().updateItem('a', { quantity: 9 });
    resolve(ok(saved(issuedItems, { status: 'PENDING', version: 4 })));
    await pending;

    const st = store.getState();
    expect(st.storedStatus).toBe('PENDING');
    expect(st.formData.items.find((i) => i.id === 'a')?.quantity).toBe(2); // the lines it was issued with
    expect(st.hasUnsavedChanges).toBe(false); // nothing allowed was edited
    // AC-05b: the notice names what was dropped (the line change) and does not imply that edits to
    // the fields an issued invoice allows were lost too (review r10 N3, T80). Nothing allowed was
    // edited, so it does not say anything is kept to save (review r11 F2, T81).
    expect(cmd(store).issuedEditsDroppedNotice).toBe(
      'Your changes to the lines and other locked details were not saved because the invoice is now issued.'
    );
    expectTotalsMatchVisibleLines(store);

    cmd(store).dismissIssuedEditsDroppedNotice();
    expect(cmd(store).issuedEditsDroppedNotice).toBeNull();
  });

  it('keeps edits to due date / notes / payment terms / PO number and stays unsaved', async () => {
    const issuedItems = editorData().initialData!.items;
    const resolve = deferredUpdate();
    const pending = cmd(store).save('save-and-issue');
    store.getState().updateItem('a', { quantity: 9 });
    store.getState().updateFields({ notes: 'Thanks', poNumber: 'PO-7', paymentTerms: 'Net 15' });
    resolve(ok(saved(issuedItems, { status: 'PENDING' })));
    await pending;

    const st = store.getState();
    expect(st.formData.notes).toBe('Thanks');
    expect(st.formData.poNumber).toBe('PO-7');
    expect(st.formData.paymentTerms).toBe('Net 15');
    expect(st.formData.items.find((i) => i.id === 'a')?.quantity).toBe(2);
    expect(st.hasUnsavedChanges).toBe(true);
    // The allowed edits are pending, so the notice also says they are kept (T81).
    expect(cmd(store).issuedEditsDroppedNotice).toBe(
      'Your changes to the lines and other locked details were not saved because the invoice is now issued. Edits to the due date, notes, payment terms and PO number are kept for you to save.'
    );
  });

  it('Save and issue with no edit during it sets no notice', async () => {
    updateInvoiceMock.mockResolvedValueOnce(ok(saved(editorData().initialData!.items, { status: 'PENDING' })));
    await cmd(store).save('save-and-issue');
    expect(cmd(store).issuedEditsDroppedNotice).toBeNull();
    expect(store.getState().hasUnsavedChanges).toBe(false);
  });
});

describe('save command - edits during the save (T36)', () => {
  it('two edits in one save: both stay on screen and unsaved, and the next Save sends both', async () => {
    const resolve = deferredUpdate();
    const pending = cmd(store).save('save');
    store.getState().updateItem('a', { quantity: 5 });
    store.getState().updateField('notes', 'Second edit');
    resolve(ok(saved(editorData().initialData!.items)));
    await pending;

    const st = store.getState();
    expect(st.formData.items.find((i) => i.id === 'a')?.quantity).toBe(5);
    expect(st.formData.notes).toBe('Second edit');
    expect(st.hasUnsavedChanges).toBe(true);
    expectTotalsMatchVisibleLines(store);

    updateInvoiceMock.mockResolvedValueOnce(ok(saved([line('a', 5), line('b', 1, 7.5)], { version: 5 })));
    await cmd(store).save('save');
    const [, payload] = updateInvoiceMock.mock.calls[1];
    expect(payload.items.find((i: InvoiceFormItem) => i.id === 'a').quantity).toBe(5);
    expect(payload.notes).toBe('Second edit');
    expect(payload.loadedVersion).toBe(4);
    expect(store.getState().hasUnsavedChanges).toBe(false);
  });

  it('a line deleted during the save stays deleted, totals add up the remaining lines, the next Save sends it', async () => {
    const resolve = deferredUpdate();
    const pending = cmd(store).save('save');
    store.getState().deleteItem('b');
    resolve(ok(saved(editorData().initialData!.items, { total: 555.55 })));
    await pending;

    const st = store.getState();
    expect(st.formData.items.map((i) => i.id)).toEqual(['a']);
    expect(st.hasUnsavedChanges).toBe(true);
    expect(st.total).not.toBe(555.55);
    expectTotalsMatchVisibleLines(store);

    updateInvoiceMock.mockResolvedValueOnce(ok(saved([line('a', 2)], { version: 5 })));
    await cmd(store).save('save');
    expect(updateInvoiceMock.mock.calls[1][1].items.map((i: InvoiceFormItem) => i.id)).toEqual(['a']);
    expect(store.getState().hasUnsavedChanges).toBe(false);
  });

  it('notes changed during Save and issue are kept, no notice, and the next Save stores them', async () => {
    const issuedItems = editorData().initialData!.items;
    const resolve = deferredUpdate();
    const pending = cmd(store).save('save-and-issue');
    store.getState().updateField('notes', 'Paid by card, thanks');
    resolve(ok(saved(issuedItems, { status: 'PENDING', version: 4 })));
    await pending;

    let st = store.getState();
    expect(st.storedStatus).toBe('PENDING');
    expect(st.formData.notes).toBe('Paid by card, thanks');
    expect(st.hasUnsavedChanges).toBe(true);
    expect(cmd(store).issuedEditsDroppedNotice).toBeNull(); // notes are allowed on an issued invoice

    updateInvoiceMock.mockResolvedValueOnce(ok(saved(issuedItems, { status: 'PENDING', version: 5 })));
    await cmd(store).save('save');
    const [, payload] = updateInvoiceMock.mock.calls[1];
    expect(payload.notes).toBe('Paid by card, thanks');
    expect(payload.status).toBe('PENDING');
    expect(payload.loadedVersion).toBe(4);
    st = store.getState();
    expect(st.hasUnsavedChanges).toBe(false);
    expect(st.formData.notes).toBe('Paid by card, thanks');
  });
});

describe('race: edits injected at random points of the save (50 runs, seeded)', () => {
  // Small deterministic PRNG (LCG) so a failure reproduces: rerun with SAVE_RACE_SEED=<seed>.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  }
  // A fixed default keeps the run the same everywhere; SAVE_RACE_SEED=<n> tries another interleaving.
  // The seed is printed on failure either way.
  const DEFAULT_SEED = 20261010;
  const SEED = Number(process.env.SAVE_RACE_SEED ?? DEFAULT_SEED);
  const RUNS = 50;
  const MAX_TICKS = 6;

  /** Lets `n` microtask turns pass, so the save advances by a random amount around the edit. */
  async function ticks(n: number) {
    for (let i = 0; i < n; i++) await Promise.resolve();
  }

  // Where an edit landed relative to the save, so the test can prove every kind of interleaving was
  // exercised and not just whichever the random plan happened to favour.
  const INTERLEAVINGS = [
    'edit before resolve',
    'edit between resolve and apply',
    'edit after apply',
    'two edits per save',
    'line deleted mid-save',
  ] as const;
  type Interleaving = (typeof INTERLEAVINGS)[number];

  it('loses 0 edits, never marks them saved, and the totals shown always match what they claim', async () => {
    const rand = rng(SEED);
    const seen = new Map<Interleaving, number>(INTERLEAVINGS.map((i) => [i, 0]));
    const hit = (i: Interleaving) => seen.set(i, (seen.get(i) ?? 0) + 1);
    const int = (n: number) => Math.floor(rand() * n);
    for (let run = 0; run < RUNS; run++) {
      const plan: string[] = [];
      try {
        updateInvoiceMock.mockReset();
        const s = createInvoiceEditorStore(editorData());
        const STORED_TOTAL = 777.77; // deliberately not what the lines add up to
        // After every state change: a clean form may show the stored figures; an edited one must
        // show what its visible lines add up to. Recorded, not thrown, so the save is never aborted.
        const violations: string[] = [];
        const unsub = s.subscribe((st) => {
          if (!st.hasUnsavedChanges) return;
          const a = visibleAmounts(s);
          const expected = [Number(a.subtotal), Number(a.taxAmount), Number(a.total)];
          const got = [st.subtotal, st.taxAmount, st.total];
          if (JSON.stringify(got) !== JSON.stringify(expected)) {
            violations.push(`edited form shows ${got} but its lines add up to ${expected}`);
          }
        });
        const edits: Array<[string, () => void]> = [
          ['qty a', () => s.getState().updateItem('a', { quantity: 3 + run })],
          ['price b', () => s.getState().updateItem('b', { price: 1 + run })],
          ['discount', () => s.getState().updateField('discount', run % 7)],
          ['taxRate', () => s.getState().updateField('taxRate', run % 20)],
          ['notes', () => s.getState().updateField('notes', `note ${run}`)],
          ['add line', () => s.getState().addItem()],
          ['delete b', () => s.getState().deleteItem('b')],
        ];
        const editCount = 1 + int(2); // one or two edits in this save
        const resolveAt = int(editCount + 1); // how many of the edits land before resolve()

        const resolve = deferredUpdate();
        const pending = cmd(s).save('save');
        const versionBefore = s.getState().loadedVersion;
        let resolved = false;
        if (editCount === 2) hit('two edits per save');
        for (let e = 0; e <= editCount; e++) {
          if (e === resolveAt) {
            const before = int(MAX_TICKS);
            await ticks(before);
            plan.push(`ticks ${before}`, 'resolve');
            resolved = true;
            resolve(ok(saved(editorData().initialData!.items, { total: STORED_TOTAL })));
          }
          if (e === editCount) break;
          const n = int(MAX_TICKS);
          // 0 ticks means no await at all: an edit in the same turn as resolve(), before the save applies.
          if (n > 0) await ticks(n);
          const [name, edit] = edits[int(edits.length)];
          plan.push(`ticks ${n}`, name);
          // The save applies its answer by moving loadedVersion on; that is the moment of "apply".
          const applied = s.getState().loadedVersion !== versionBefore;
          hit(!resolved ? 'edit before resolve' : applied ? 'edit after apply' : 'edit between resolve and apply');
          if (name === 'delete b' && s.getState().isSaving) hit('line deleted mid-save');
          edit();
        }
        const typed = s.getState().formData;
        const after = int(MAX_TICKS);
        await ticks(after);
        plan.push(`ticks ${after}`);
        await pending;
        unsub();

        const st = s.getState();
        expect(violations).toEqual([]);
        expect(st.formData.items).toEqual(typed.items);
        expect(st.formData.discount).toBe(typed.discount);
        expect(st.formData.taxRate).toBe(typed.taxRate);
        expect(st.formData.notes).toBe(typed.notes);
        expect(st.hasUnsavedChanges).toBe(true);
        expect(st.isSaving).toBe(false);
        expect(st.loadedVersion).toBe(4);
        expectTotalsMatchVisibleLines(s);

        // The next Save sends every edit.
        updateInvoiceMock.mockResolvedValueOnce(ok(saved(typed.items, { version: 5 })));
        await cmd(s).save('save');
        const payload = updateInvoiceMock.mock.calls[1][1];
        expect(payload.items).toEqual(typed.items);
        expect([payload.discount, payload.taxRate, payload.notes]).toEqual([typed.discount, typed.taxRate, typed.notes]);
        expect(payload.loadedVersion).toBe(4);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `save race failed - reproduce with SAVE_RACE_SEED=${SEED} (run ${run}: ${plan.join(' -> ')})\n${message}`
        );
      }
    }

    // Every kind of interleaving happened at least once, or this run proved less than it claims.
    const missed = INTERLEAVINGS.filter((i) => !seen.get(i));
    expect(
      missed,
      `interleavings never exercised with SAVE_RACE_SEED=${SEED}: ${missed.join(', ')} (counts: ${JSON.stringify(Object.fromEntries(seen))})`
    ).toEqual([]);
  });
});
