// @vitest-environment jsdom
// T21 (spec.md §5 AC-16, AC-31) — SCR-11 custom price dialog states: validation shows a
// FieldError with the contract text (AC-16, same messages as create); not-found shows a
// destructive Alert "Customer or product not found." and keeps the dialog open (AC-31);
// editing shows the Customer/product read-only, because updateCustomPrice no longer takes
// their ids. See
// docs/features/architecture-hardening/tasks/t21-custom-price-validation-and-links.md
// (screens.md §SCR-11, states: validation / not-found / default-edit, abridged) and
// test-plan.md rows for AC-16 / AC-31 (component).
//
// RED (T21 not yet implemented): CustomPriceModal has no `customerId` field at all (its form
// schema is `customPriceFormSchema` with only `productId`/`name`/`price`/`notes`), no
// `fixedCustomerId`/`fixedProductId` props, and its `onFormSubmit` prop is `Promise<void>` — it
// never inspects an ActionResult, so a NOT_FOUND result can't be told apart from success and no
// Alert is ever rendered.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail, ok } from '@/types/actions';
import { CustomPriceModal } from '@/components/modals/customer/custom-price-modal';
import type { SerializedCustomPrice } from '@/types/custom-price/types';

const NOT_FOUND_MESSAGE = 'Customer or product not found.';

function buildDefaultValues(): SerializedCustomPrice {
  return {
    id: 'cp_1',
    productId: 'prod_1',
    customerId: 'cust_1',
    name: 'Wholesale',
    price: 60,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    product: {
      id: 'prod_1',
      name: 'Widget',
      price: 100,
      currency: 'USD',
      unit: 'pcs',
      isActive: true,
    },
    customer: {
      id: 'cust_1',
      name: 'Acme',
      companyName: null,
    },
  };
}

describe('CustomPriceModal — states (T21, AC-16, AC-31)', () => {
  it('validation: a negative price shows the contract FieldError and does not call onFormSubmit', async () => {
    const user = userEvent.setup();
    const onFormSubmit = vi.fn().mockResolvedValue(ok({ id: 'new-id' }));

    render(
      <CustomPriceModal
        open
        close={vi.fn()}
        mode="selectProduct"
        fixedCustomerId="cust_1"
        fixedProductId="prod_1"
        onFormSubmit={onFormSubmit}
        onLoadProducts={vi.fn().mockResolvedValue([])}
      />
    );

    // The price Input sanitizes out non-digit characters (including "-"), so an empty price
    // (coerced to 0) is the way to drive the same "Price must be positive." contract message
    // through this control without touching onFormSubmit.
    const priceInput = screen.getByRole('textbox', { name: /Custom Price/ });
    await user.clear(priceInput);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Price must be positive.')).toBeInTheDocument();
    expect(onFormSubmit).not.toHaveBeenCalled();
  });

  // F-04 (T32): the price Input's onChange stripped "-" (and letters) before parsing, silently
  // rewriting a negative entry into a positive one instead of letting the schema reject it
  // (spec.md §3 "the entered value is never silently corrected").
  it('F-04: a negative price is kept as negative and rejected, instead of being silently turned positive', async () => {
    const user = userEvent.setup();
    const onFormSubmit = vi.fn().mockResolvedValue(ok({ id: 'new-id' }));

    render(
      <CustomPriceModal
        open
        close={vi.fn()}
        mode="selectProduct"
        fixedCustomerId="cust_1"
        fixedProductId="prod_1"
        onFormSubmit={onFormSubmit}
        onLoadProducts={vi.fn().mockResolvedValue([])}
      />
    );

    const priceInput = screen.getByRole('textbox', { name: /Custom Price/ });
    await user.clear(priceInput);
    await user.type(priceInput, '-5');

    expect(priceInput).toHaveValue('-5');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Price must be positive.')).toBeInTheDocument();
    expect(onFormSubmit).not.toHaveBeenCalled();
  });

  it('not-found: shows a destructive Alert and keeps the dialog open with the entered value', async () => {
    const user = userEvent.setup();
    const onFormSubmit = vi.fn().mockResolvedValue(fail('NOT_FOUND', NOT_FOUND_MESSAGE));

    render(
      <CustomPriceModal
        open
        close={vi.fn()}
        isEditing
        mode="selectProduct"
        defaultValues={buildDefaultValues()}
        onFormSubmit={onFormSubmit}
        onLoadProducts={vi.fn().mockResolvedValue([])}
      />
    );

    const priceInput = screen.getByRole('textbox', { name: /Custom Price/ });
    await user.clear(priceInput);
    await user.type(priceInput, '75');
    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(await screen.findByText(NOT_FOUND_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Custom Price/ })).toHaveValue('75');
  });

  it('default-edit: shows the Customer/product read-only and no picker control', () => {
    render(
      <CustomPriceModal
        open
        close={vi.fn()}
        isEditing
        mode="selectProduct"
        defaultValues={buildDefaultValues()}
        onFormSubmit={vi.fn().mockResolvedValue(ok(undefined))}
        onLoadProducts={vi.fn().mockResolvedValue([])}
      />
    );

    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
