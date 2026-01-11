'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertCircle } from 'lucide-react';

export interface ValidationErrorDialogProps {
  open: boolean;
  errors: string[];
  onClose: () => void;
}

export function ValidationErrorDialog({
  open,
  errors,
  onClose,
}: ValidationErrorDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="text-destructive h-5 w-5" />
            Cannot Save Invoice
          </AlertDialogTitle>
          <AlertDialogDescription>
            Please fix the following errors before saving:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="text-destructive list-inside list-disc space-y-1 text-sm">
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
