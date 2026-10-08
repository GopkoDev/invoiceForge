'use client';

import { useId, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Building2,
  CreditCard,
  Check,
  ChevronsUpDown,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import {
  useSenderProfileOptions,
  useAvailableBankAccounts,
  useSelectedSenderProfile,
  useSelectedBankAccount,
  useInvoiceEditorActions,
  useEditorLocks,
  useIssuedDetails,
  useFieldErrors,
} from '@/store/invoice-editor-store';
import { FieldError } from '@/components/ui/field';
import { IssuedDetailsCard } from './issued-details-card';
import { InvoiceEditorSelectedPreview } from './invoice-editor-selected-preview';

export function SenderSection() {
  const [open, setOpen] = useState(false);
  const [openBankAccount, setOpenBankAccount] = useState(false);
  // The bank account picker is named by its label, then its value (review r2 L2), and is
  // described by its error text while it has one (review r3 P2).
  const fieldId = useId();
  const bankAccountLabelId = `${fieldId}-bank-account-label`;
  const bankAccountTriggerId = `${fieldId}-bank-account`;
  const bankAccountErrorId = `${fieldId}-bank-account-error`;

  const senderProfileOptions = useSenderProfileOptions();
  const availableBankAccounts = useAvailableBankAccounts();
  const selectedProfile = useSelectedSenderProfile();
  const selectedBank = useSelectedBankAccount();

  const { selectSenderProfile, selectBankAccount } = useInvoiceEditorActions();
  const { locked } = useEditorLocks();
  const issued = useIssuedDetails();
  const fieldErrors = useFieldErrors();

  const isBankAccountDisabled =
    !selectedProfile || availableBankAccounts.length === 0;

  if (locked) {
    // Never a picker once issued or cancelled; without issued details, the selected records as text.
    const sender = issued?.sender ?? {
      name: selectedProfile?.name,
      legalName: selectedProfile?.legalName,
      taxId: selectedProfile?.taxId,
      address: selectedProfile?.address,
      city: selectedProfile?.city,
      country: selectedProfile?.country,
      postalCode: selectedProfile?.postalCode,
      email: selectedProfile?.email,
    };
    const bank = issued?.bank ?? {
      bankName: selectedBank?.bankName,
      accountName: selectedBank?.accountName,
      accountNumber: selectedBank?.accountNumber,
      iban: selectedBank?.iban,
      swift: selectedBank?.swift,
    };
    return (
      <IssuedDetailsCard
        title="From"
        icon={<Building2 className="h-4 w-4" />}
        lines={[
          sender.name,
          sender.legalName,
          sender.address,
          [sender.postalCode, sender.city, sender.country].filter(Boolean).join(', '),
          sender.email,
          sender.taxId && `Tax ID: ${sender.taxId}`,
        ]}
        extra={{
          label: 'Bank account',
          lines: [
            bank.bankName,
            bank.accountName,
            bank.accountNumber && `Account number: ${bank.accountNumber}`,
            bank.iban && `IBAN: ${bank.iban}`,
            bank.swift && `SWIFT: ${bank.swift}`,
          ],
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          From
        </CardTitle>

        <CardDescription>
          Select the sender profile and bank account for the invoice.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>
            Sender Profile <span className="text-destructive">*</span>
          </Label>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger className="border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mb-0 inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-md border px-2.5 text-sm font-normal shadow-xs">
              <span className="truncate">
                {selectedProfile?.name || 'Select sender profile...'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>

            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder="Search sender profile..." />

                <CommandList>
                  <CommandEmpty>No sender profile found.</CommandEmpty>

                  <CommandGroup>
                    {senderProfileOptions.map((profile) => (
                      <CommandItem
                        key={profile.id}
                        value={profile.name}
                        disabled={!profile.hasBankAccounts}
                        onSelect={() => {
                          if (!profile.hasBankAccounts) return;
                          selectSenderProfile(profile.id);
                          setOpen(false);
                        }}
                        className={cn(
                          !profile.hasBankAccounts &&
                            'cursor-not-allowed opacity-50'
                        )}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedProfile?.id === profile.id
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        <div className="flex flex-1 flex-col">
                          <div className="flex items-center gap-2">
                            <span>{profile.name}</span>
                            {!profile.hasBankAccounts && (
                              <span className="text-destructive flex items-center gap-1 text-xs">
                                <Ban className="h-3 w-3" />
                                No bank accounts
                              </span>
                            )}
                          </div>

                          {profile.city && (
                            <span className="text-muted-foreground text-xs">
                              {[profile.city, profile.country]
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Selected Profile Preview */}
        {selectedProfile && (
          <InvoiceEditorSelectedPreview
            title={selectedProfile.name}
            textsArray={[
              selectedProfile.address,
              [selectedProfile.city, selectedProfile.country]
                .filter(Boolean)
                .join(', '),
              selectedProfile.email,
              selectedProfile.taxId ? `Tax ID: ${selectedProfile.taxId}` : null,
            ]}
          />
        )}

        {/* Bank Account Popover */}
        <div className="space-y-2">
          <Label id={bankAccountLabelId} className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Bank Account <span className="text-destructive">*</span>
          </Label>

          <Popover open={openBankAccount} onOpenChange={setOpenBankAccount}>
            <PopoverTrigger
              id={bankAccountTriggerId}
              aria-labelledby={`${bankAccountLabelId} ${bankAccountTriggerId}`}
              disabled={isBankAccountDisabled}
              aria-invalid={!!fieldErrors?.bankAccountId}
              aria-describedby={fieldErrors?.bankAccountId ? bankAccountErrorId : undefined}
              className={cn(
                'border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 aria-invalid:border-destructive mb-0 inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-md border px-2.5 text-sm font-normal shadow-xs',
                isBankAccountDisabled && 'cursor-not-allowed opacity-50'
              )}
            >
              <span className="truncate">
                {selectedBank
                  ? `${selectedBank.bankName} (${selectedBank.currency})`
                  : 'Select bank account...'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>

            <PopoverContent className="w-full p-0" align="start" sideOffset={0}>
              <Command>
                <CommandInput placeholder="Search bank account..." />

                <CommandList>
                  <CommandEmpty>No bank account found.</CommandEmpty>
                  <CommandGroup>
                    {availableBankAccounts.map((account) => (
                      <CommandItem
                        key={account.id}
                        value={`${account.bankName} ${account.currency}`}
                        onSelect={() => {
                          selectBankAccount(account.id);
                          setOpenBankAccount(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedBank?.id === account.id
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        <div className="flex flex-col">
                          <span>
                            {account.bankName} ({account.currency})
                          </span>
                          {account.accountName && (
                            <span className="text-muted-foreground text-xs">
                              {account.accountName}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FieldError
            id={bankAccountErrorId}
            errors={fieldErrors?.bankAccountId?.map((message) => ({ message }))}
          />
        </div>

        {/* Selected Bank Preview */}
        {selectedBank && (
          <InvoiceEditorSelectedPreview
            title={selectedBank.bankName}
            textsArray={[
              selectedBank.accountName,
              selectedBank.iban ? `IBAN: ${selectedBank.iban}` : null,
              selectedBank.swift ? `SWIFT: ${selectedBank.swift}` : null,
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}
