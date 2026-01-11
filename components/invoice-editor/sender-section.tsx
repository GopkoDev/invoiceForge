'use client';

import { useState } from 'react';
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
} from '@/store/invoice-editor-store';
import { InvoiceEditorSelectedPreview } from './invoice-editor-selected-preview';

export function SenderSection() {
  const [open, setOpen] = useState(false);
  const [openBankAccount, setOpenBankAccount] = useState(false);

  const senderProfileOptions = useSenderProfileOptions();
  const availableBankAccounts = useAvailableBankAccounts();
  const selectedProfile = useSelectedSenderProfile();
  const selectedBank = useSelectedBankAccount();

  const { selectSenderProfile, selectBankAccount } = useInvoiceEditorActions();

  const isBankAccountDisabled =
    !selectedProfile || availableBankAccounts.length === 0;

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
          <Label className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Bank Account <span className="text-destructive">*</span>
          </Label>

          <Popover open={openBankAccount} onOpenChange={setOpenBankAccount}>
            <PopoverTrigger
              disabled={isBankAccountDisabled}
              className={cn(
                'border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mb-0 inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-md border px-2.5 text-sm font-normal shadow-xs',
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
