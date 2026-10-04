// @vitest-environment jsdom
// AC-21: a stored value failing isWebAddress is never an href or an image src.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';
import { WEB_ADDRESS_MESSAGE } from '@/lib/validations/web-address';

// Radix AvatarImage never renders <img> in jsdom (no load event); expose src deterministically.
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test stub of the Radix primitive
    <img data-testid="avatar-img" src={src} alt="" />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
}));

vi.mock('@react-pdf/renderer', () => {
  const el = (name: string) => {
    const Mock = ({
      children,
      src,
    }: {
      children?: React.ReactNode;
      src?: string;
    }) => (
      <div data-pdf={name} data-src={src}>
        {children}
      </div>
    );
    Mock.displayName = name;
    return Mock;
  };
  return {
    Document: el('Document'),
    Page: el('Page'),
    View: el('View'),
    Text: el('Text'),
    Image: el('Image'),
    Link: el('Link'),
    Font: { register: vi.fn() },
    StyleSheet: { create: <T,>(s: T) => s },
  };
});

const createCustomerMock = vi.fn();
vi.mock('@/lib/actions/customer-actions', () => ({
  createCustomer: (...a: unknown[]) => createCustomerMock(...a),
  updateCustomer: vi.fn(),
}));

const createSenderProfileMock = vi.fn();
vi.mock('@/lib/actions/sender-profile-actions', () => ({
  createSenderProfile: (...a: unknown[]) => createSenderProfileMock(...a),
  updateSenderProfile: vi.fn(),
}));

// The sidebars import formatFullAddress via the lib/helpers barrel, which pulls this server action.
vi.mock('@/lib/actions/bank-account-actions', () => ({
  createBankAccount: vi.fn(),
  updateBankAccount: vi.fn(),
}));

const updateProfileMock = vi.fn();
vi.mock('@/lib/actions/profile-actions', () => ({
  updateProfile: (...a: unknown[]) => updateProfileMock(...a),
}));

vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  for (const m of [
    createCustomerMock,
    createSenderProfileMock,
    updateProfileMock,
    routerPush,
  ]) {
    m.mockReset();
  }
});

const { ContactCard } =
  await import('@/components/layout/contacts/contact-card/contact-card');
const { InvoicePDFDocument } =
  await import('@/components/invoice-editor/invoice-pdf-document');
const { CustomerInfoSidebar } =
  await import('@/components/customers/customer-info-sidebar');
const { SenderProfileInfoSidebar } =
  await import('@/components/sender-profiles/sender-profile-info-sidebar');
const { ProfileSettings } =
  await import('@/components/settings/profile-settings');
const { UserAvatar } = await import('@/components/layout/user/user-avatar');
const { CustomerForm } = await import('@/components/customers/customer-form');
const { SenderProfileForm } =
  await import('@/components/sender-profiles/sender-profile-form');

const card = (website: string | null, image: string | null) => (
  <ContactCard
    avatar={{ src: image, fallback: 'AC' }}
    title="Acme Corp"
    contactInfo={{ website }}
    actions={null}
  />
);

describe('ContactCard legacy addresses (T17, AC-21)', () => {
  it('renders a non-web website as plain text, never an anchor', () => {
    const { container } = render(card('javascript:alert(1)', null));
    expect(screen.getByText('javascript:alert(1)')).toBeTruthy();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('gives a non-web image no src and shows initials', () => {
    render(card(null, 'data:image/png;base64,AAAA'));
    expect(screen.queryByTestId('avatar-img')).toBeNull();
    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('keeps a valid https website as a link and a valid https image as src', () => {
    const { container } = render(
      card('https://acme.test', 'https://acme.test/a.png')
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'https://acme.test'
    );
    expect(screen.getByTestId('avatar-img').getAttribute('src')).toBe(
      'https://acme.test/a.png'
    );
  });
});

describe('InvoicePDFDocument legacy logo (T17, AC-21)', () => {
  it('renders no Image for a stored data: logo', () => {
    const { container } = render(
      <InvoicePDFDocument
        formData={
          {
            invoiceNumber: 'INV-1',
            issueDate: new Date('2026-01-01'),
            dueDate: new Date('2026-01-31'),
            items: [],
          } as never
        }
        senderProfile={{ logo: 'data:image/png;base64,AAAA' } as never}
        subtotal={0}
        taxAmount={0}
        total={0}
        logoBase64={null}
      />
    );
    expect(container.querySelector('[data-pdf="Image"]')).toBeNull();
  });
});

const customer = (image: string | null, website: string | null) =>
  ({
    id: 'cust-1',
    name: 'Acme Corp',
    companyName: null,
    email: null,
    phone: null,
    website,
    image,
    address: null,
    city: null,
    postalCode: null,
    country: null,
    taxId: null,
    notes: null,
    defaultCurrency: 'USD',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    _count: { invoices: 0, customPrices: 0 },
  }) as unknown as React.ComponentProps<typeof CustomerInfoSidebar>['customer'];

const senderProfile = (logo: string | null) =>
  ({
    id: 'sp-1',
    name: 'Acme LLC',
    legalName: null,
    email: null,
    phone: null,
    website: 'javascript:alert(1)',
    logo,
    address: null,
    city: null,
    postalCode: null,
    country: null,
    taxId: null,
    invoicePrefix: 'INV',
    isDefault: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    _count: { invoices: 0, bankAccounts: 0 },
  }) as unknown as React.ComponentProps<
    typeof SenderProfileInfoSidebar
  >['profile'];

describe('Detail sidebars legacy addresses (T17, AC-21, SCR-09)', () => {
  it('customer sidebar gives a stored data: image no src, shows initials and the website as text', () => {
    const { container } = render(
      <CustomerInfoSidebar
        customer={customer('data:image/png;base64,AAAA', 'javascript:alert(1)')}
      />
    );
    expect(screen.queryByTestId('avatar-img')).toBeNull();
    expect(screen.getByTestId('avatar-fallback').textContent).toBe('AC');
    expect(screen.getByText('javascript:alert(1)')).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
  });

  it('customer sidebar keeps a valid https image as src', () => {
    render(
      <CustomerInfoSidebar
        customer={customer('https://acme.test/a.png', null)}
      />
    );
    expect(screen.getByTestId('avatar-img').getAttribute('src')).toBe(
      'https://acme.test/a.png'
    );
  });

  it('sender profile sidebar gives a stored data: logo no src and shows the website as text', () => {
    const { container } = render(
      <SenderProfileInfoSidebar
        profile={senderProfile('data:image/png;base64,AAAA')}
      />
    );
    expect(screen.queryByTestId('avatar-img')).toBeNull();
    expect(screen.getByTestId('avatar-fallback')).toBeTruthy();
    expect(screen.getByText('javascript:alert(1)')).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
  });

  it('sender profile sidebar keeps a valid https logo as src', () => {
    render(
      <SenderProfileInfoSidebar
        profile={senderProfile('https://acme.test/logo.png')}
      />
    );
    expect(screen.getByTestId('avatar-img').getAttribute('src')).toBe(
      'https://acme.test/logo.png'
    );
  });
});

describe('ProfileSettings avatar address (T17, AC-21, SCR-05)', () => {
  const sessionUser = {
    id: 'user-1',
    name: 'Jane Doe',
    email: 'jane@acme.test',
  };

  it.each(['javascript:alert(1)', 'data:image/png;base64,AAAA'])(
    'typed %s: shows the FieldError, previews initials and never uses the value as src',
    async (value) => {
      const user = userEvent.setup();
      const { container } = render(<ProfileSettings user={sessionUser} />);

      await user.type(screen.getByLabelText('Avatar URL'), value);
      const scheme = value.split(':')[0];
      expect(container.querySelector(`img[src^="${scheme}:"]`)).toBeNull();
      expect(screen.getByTestId('avatar-fallback').textContent).toBe('J');

      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      expect(await screen.findByText(WEB_ADDRESS_MESSAGE)).toBeTruthy();
      expect(container.querySelector(`img[src^="${scheme}:"]`)).toBeNull();
      expect(updateProfileMock).not.toHaveBeenCalled();
    }
  );
});

describe('Editor forms map server fieldErrors to the field (T17, AC-21, SCR-07/SCR-08)', () => {
  it('CustomerForm shows a server VALIDATION fieldErrors.website message next to the field', async () => {
    const user = userEvent.setup();
    createCustomerMock.mockResolvedValue(
      fail('VALIDATION', 'Please fix the highlighted fields.', {
        fieldErrors: { website: [WEB_ADDRESS_MESSAGE] },
      })
    );
    render(<CustomerForm />);

    await user.type(screen.getByLabelText(/Contact Name/), 'Acme Corp');
    await user.type(screen.getByLabelText('Website'), 'https://acme.test');
    await user.click(screen.getByRole('button', { name: 'Create Customer' }));

    const message = await screen.findByText(WEB_ADDRESS_MESSAGE);
    expect(message.closest('[data-slot="field"]')?.textContent).toContain(
      'Website'
    );
    expect(screen.getByLabelText('Website')).toHaveValue('https://acme.test');
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('CustomerForm shows a server VALIDATION fieldErrors.image message next to the field', async () => {
    const user = userEvent.setup();
    createCustomerMock.mockResolvedValue(
      fail('VALIDATION', 'Please fix the highlighted fields.', {
        fieldErrors: { image: [WEB_ADDRESS_MESSAGE] },
      })
    );
    render(<CustomerForm />);

    await user.type(screen.getByLabelText(/Contact Name/), 'Acme Corp');
    await user.click(screen.getByRole('button', { name: 'Create Customer' }));

    const message = await screen.findByText(WEB_ADDRESS_MESSAGE);
    expect(message.closest('[data-slot="field"]')?.textContent).toContain(
      'Image URL'
    );
    await waitFor(() => expect(routerPush).not.toHaveBeenCalled());
  });

  it('SenderProfileForm shows a server VALIDATION fieldErrors.website message next to the field', async () => {
    const user = userEvent.setup();
    createSenderProfileMock.mockResolvedValue(
      fail('VALIDATION', 'Please fix the highlighted fields.', {
        fieldErrors: { website: [WEB_ADDRESS_MESSAGE] },
      })
    );
    render(<SenderProfileForm />);

    await user.type(screen.getByLabelText(/^Name/), 'Acme LLC');
    await user.type(screen.getByLabelText(/Invoice Prefix/), 'INV');
    await user.click(screen.getByRole('button', { name: /Create Profile/ }));

    const message = await screen.findByText(WEB_ADDRESS_MESSAGE);
    expect(message.closest('[data-slot="field"]')?.textContent).toContain(
      'Website'
    );
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe('UserAvatar legacy image (T23, AC-21, F-07)', () => {
  const sessionUser = (image: string | null) =>
    ({
      id: 'user-1',
      name: 'Jane Doe',
      email: 'jane@acme.test',
      image,
    }) as never;

  it.each(['javascript:alert(1)', 'data:image/png;base64,AAAA'])(
    'gives a stored %s image no src and shows the initial',
    (value) => {
      const { container } = render(<UserAvatar user={sessionUser(value)} />);
      expect(screen.queryByTestId('avatar-img')).toBeNull();
      expect(container.querySelector('img[src]')).toBeNull();
      expect(screen.getByTestId('avatar-fallback').textContent).toBe('J');
    }
  );

  it('keeps a valid https image as src', () => {
    render(<UserAvatar user={sessionUser('https://acme.test/a.png')} />);
    expect(screen.getByTestId('avatar-img').getAttribute('src')).toBe(
      'https://acme.test/a.png'
    );
  });
});
