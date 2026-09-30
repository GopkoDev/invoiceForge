import { useEffect } from 'react';
import { isRedirectingToSignIn } from '@/lib/helpers/client-session-redirect';

/** Asks the browser to confirm leaving the page while the editor holds unsaved changes. */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean) {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // AC-21: a redirect to sign-in must never be blockable by this prompt.
      if (hasUnsavedChanges && !isRedirectingToSignIn()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);
}
