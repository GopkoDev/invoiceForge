'use client';

import { AlertTriangle, Check, Circle, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useInvoiceEditorActions, useIssuedEditsDroppedNotice } from '@/store/invoice-editor-store';

interface SaveStatusProps {
  isNew: boolean;
  isSaved: boolean;
}

const map = {
  saved: {
    text: 'Saved',
    icon: Check,
    iconClass: 'text-muted-foreground h-4 w-4',
    textClass: 'text-muted-foreground',
  },
  unsaved: {
    text: 'Unsaved',
    icon: Circle,
    iconClass: 'fill-destructive text-destructive h-3 w-3',
    textClass: 'text-destructive font-medium',
  },
};

export function EditorSaveStatus({ isNew, isSaved }: SaveStatusProps) {
  if (isNew && isSaved) return null;

  const statusKey = isSaved ? 'saved' : 'unsaved';
  const { icon: Icon, iconClass, textClass, text } = map[statusKey];

  return (
    <>
      {/* Desktop */}
      <div className="hidden items-center gap-1.5 text-sm sm:flex">
        <Icon className={iconClass} />
        <span className={textClass}>{text}</span>
      </div>

      {/* Mobile */}
      <div className="flex items-center sm:hidden">
        <Icon className={iconClass} />
      </div>
    </>
  );
}

/** AC-05b: edits made while Save and issue ran were not saved because the invoice is now issued. */
export function IssuedEditsDroppedNotice() {
  const notice = useIssuedEditsDroppedNotice();
  const { dismissIssuedEditsDroppedNotice } = useInvoiceEditorActions();
  if (!notice) return null;

  return (
    <Alert role="status">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-start justify-between gap-2">
        <span>{notice}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label="Dismiss"
          onClick={dismissIssuedEditsDroppedNotice}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
