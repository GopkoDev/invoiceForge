'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { Users, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCustomers,
  useSelectedCustomer,
  useInvoiceEditorActions,
} from '@/store/invoice-editor-store';
import { InvoiceEditorSelectedPreview } from './invoice-editor-selected-preview';

export function CustomerSection() {
  const [open, setOpen] = useState(false);
  const customers = useCustomers();
  const selectedCustomer = useSelectedCustomer();
  const { selectCustomer } = useInvoiceEditorActions();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          To
        </CardTitle>
        <CardDescription>Select the customer for this invoice.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>
            Customer <span className="text-destructive">*</span>
          </Label>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger className="border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mb-0 inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-md border px-2.5 text-sm font-normal shadow-xs">
              <span className="truncate">
                {selectedCustomer
                  ? selectedCustomer.name
                  : 'Select customer...'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>

            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder="Search customer..." />

                <CommandList>
                  <CommandEmpty>No customer found.</CommandEmpty>

                  <CommandGroup>
                    {customers.map((customer) => (
                      <CommandItem
                        key={customer.id}
                        value={customer.name}
                        onSelect={() => {
                          selectCustomer(customer.id);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedCustomer?.id === customer.id
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{customer.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {[customer.city, customer.country]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Selected Customer Preview */}
        {selectedCustomer && (
          <InvoiceEditorSelectedPreview
            title={selectedCustomer.name}
            textsArray={[
              selectedCustomer.address ? selectedCustomer.address : null,
              selectedCustomer.city || selectedCustomer.country
                ? [selectedCustomer.city, selectedCustomer.country]
                    .filter(Boolean)
                    .join(', ')
                : null,
              selectedCustomer.email ? selectedCustomer.email : null,
              selectedCustomer.taxId
                ? `Tax ID: ${selectedCustomer.taxId}`
                : null,
              `Default currency: ${selectedCustomer.defaultCurrency}`,
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}
