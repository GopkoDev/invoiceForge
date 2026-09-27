'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { ConfirmationModalProps } from './types';

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  body,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  confirmDisabled = false,
  hideConfirm = false,
}: ConfirmationModalProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = () => {
    const result = onConfirm();

    if (result && typeof result.then === 'function') {
      setPending(true);
      result.catch(() => {}).finally(() => setPending(false));
      return;
    }

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {cancelText}
          </Button>
          {!hideConfirm && (
            <Button
              variant={variant}
              onClick={handleConfirm}
              disabled={pending || confirmDisabled}
            >
              {pending && <Spinner />}
              {confirmText}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
