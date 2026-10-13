// @vitest-environment jsdom
// T30 (ai-assistant; AC-37) - SCR-04 Delete Conversations dialog, opened from SCR-01 (row delete,
// "Delete all") and SCR-02 ("Delete conversation"). See tasks/t30-delete-conversations-dialog.md
// and screens.md §SCR-04, §SCR-01 deleted, §SCR-02 deleted.
//
// Seams the implementer must provide:
//   components/modals/ai/ai-modal-container.tsx -> export function AiModalContainer()
//     mounts ConfirmationModal for the AI section (same pattern as CustomerModalContainer).
//   app/(protected)/ai/layout.tsx -> default export layout rendering {children} and <AiModalContainer />.
//   components/ai/conversation-list-client.tsx -> onDelete opens the dialog (one: id+title; all: total).
//   components/ai/conversation-header-client.tsx -> props { conversationId: string; title: string }
//     (the id is NEW: the header needs it to call deleteConversation).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail, ok } from '@/types/actions';

const deleteConversationMock = vi.fn();
const deleteAllConversationsMock = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  createDraftFromCard: vi.fn(),
  deleteConversation: (...a: unknown[]) => deleteConversationMock(...a),
  deleteAllConversations: (...a: unknown[]) => deleteAllConversationsMock(...a),
}));

const routerPush = vi.fn();
const routerRefresh = vi.fn();
let pathname = '/ai';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh, replace: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const goToSignIn = vi.fn();
vi.mock('@/lib/helpers/client-session-redirect', async (orig) => ({
  ...(await orig<typeof import('@/lib/helpers/client-session-redirect')>()),
  goToSignIn: () => goToSignIn(),
}));

import { ConversationListClient } from '@/components/ai/conversation-list-client';
import { ConversationHeaderClient } from '@/components/ai/conversation-header-client';
import { AiModalContainer } from '@/components/modals/ai/ai-modal-container';
import AiLayout from '@/app/(protected)/ai/layout';
import { useModalStore } from '@/store/use-modal-store';
import type { ConversationSummary } from '@/types/assistant/types';

// ai-chat-v2 T19: the list takes every summary (no paging); `total` extra rows stand in for the server count.
function pageOf(titles: string[], total = titles.length): ConversationSummary[] {
  return Array.from({ length: Math.max(total, titles.length) }, (_, i) => ({
    id: `c${i + 1}`,
    title: titles[i] ?? `Chat ${i + 1}`,
    lastMessageAt: '2026-10-10T09:00:00.000Z',
  }));
}

const TITLE = 'Who owes me money?';
const NOT_FOUND_COPY = "This conversation can't be found.";

function renderList(conversations = pageOf([TITLE, 'Draft for Acme'], 12)) {
  return render(
    <>
      <ConversationListClient conversations={conversations} timeZone="UTC" />
      <AiModalContainer />
    </>
  );
}

function renderHeader() {
  return render(
    <>
      <ConversationHeaderClient conversationId="c9" title={TITLE} />
      <AiModalContainer />
    </>
  );
}

async function openRowDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: `Delete conversation ${TITLE}` }));
  return screen.findByRole('dialog');
}

async function openDeleteAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Conversation actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete all' }));
  return screen.findByRole('dialog');
}

async function openHeaderDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Conversation actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete conversation' }));
  return screen.findByRole('dialog');
}

describe('SCR-04 delete Conversations dialog (T30, AC-37)', () => {
  beforeEach(() => {
    for (const m of [
      deleteConversationMock, deleteAllConversationsMock, routerPush, routerRefresh,
      toastSuccess, toastError, goToSignIn,
    ]) m.mockReset();
    useModalStore.getState().resetAllModals();
    pathname = '/ai';
  });
  afterEach(() => cleanup());

  // Review 2026-10-13 R1-U3, SCR-01 "deleted": deleting the open Conversation from the list (one, or all) leaves for
  // /ai instead of refreshing a page whose Conversation is gone (the not-found page).
  describe('from the list while a Conversation is open', () => {
    it('deleting the open row goes to /ai', async () => {
      pathname = '/ai/c1';
      deleteConversationMock.mockResolvedValue(ok());
      const user = userEvent.setup();
      renderList();
      const dialog = await openRowDelete(user);
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/ai'));
      expect(deleteConversationMock).toHaveBeenCalledWith('c1');
    });

    it('deleting another row only refreshes the list', async () => {
      pathname = '/ai/c2';
      deleteConversationMock.mockResolvedValue(ok());
      const user = userEvent.setup();
      renderList();
      const dialog = await openRowDelete(user);
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
      expect(routerPush).not.toHaveBeenCalled();
    });

    it('"Delete all" with a Conversation open goes to /ai', async () => {
      pathname = '/ai/c2';
      deleteAllConversationsMock.mockResolvedValue(ok({ deleted: 12 }));
      const user = userEvent.setup();
      renderList();
      const dialog = await openDeleteAll(user);
      await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/ai'));
    });
  });

  describe('default (one) from a list row', () => {
    it('opens with the exact title, body naming the Conversation and that drafts stay, and a destructive Delete', async () => {
      const user = userEvent.setup();
      renderList();
      const dialog = await openRowDelete(user);

      expect(within(dialog).getByText('Delete this conversation?')).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          `“${TITLE}” will be deleted for good. Drafts it created stay in your invoices.`
        )
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(deleteConversationMock).not.toHaveBeenCalled();
    });

    it('success: calls deleteConversation(id) once, closes, toasts, refreshes and does not navigate', async () => {
      const user = userEvent.setup();
      deleteConversationMock.mockResolvedValue(ok());
      renderList();
      const dialog = await openRowDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Conversation deleted.'));
      expect(deleteConversationMock).toHaveBeenCalledTimes(1);
      expect(deleteConversationMock).toHaveBeenCalledWith('c1');
      expect(deleteAllConversationsMock).not.toHaveBeenCalled();
      expect(routerRefresh).toHaveBeenCalled();
      expect(routerPush).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('pending: spinner in confirm, both buttons disabled, dialog stays open, a double click calls once', async () => {
      const user = userEvent.setup();
      let resolve!: (v: unknown) => void;
      deleteConversationMock.mockReturnValue(new Promise((r) => (resolve = r)));
      renderList();
      const dialog = await openRowDelete(user);

      const confirm = within(dialog).getByRole('button', { name: 'Delete' });
      await user.dblClick(confirm);

      await waitFor(() => expect(confirm).toBeDisabled());
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(deleteConversationMock).toHaveBeenCalledTimes(1);
      expect(toastSuccess).not.toHaveBeenCalled();

      resolve(ok());
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Conversation deleted.'));
    });

    it('not-found: closes, shows the NOT_FOUND copy verbatim and refreshes the list', async () => {
      const user = userEvent.setup();
      deleteConversationMock.mockResolvedValue(fail('NOT_FOUND', NOT_FOUND_COPY));
      renderList();
      const dialog = await openRowDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(toastError).toHaveBeenCalledWith(NOT_FOUND_COPY));
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(routerRefresh).toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('FAILED: shows the failure message as an error, no success toast', async () => {
      const user = userEvent.setup();
      deleteConversationMock.mockResolvedValue(fail('FAILED', 'The conversation was not deleted. Try again.'));
      renderList();
      const dialog = await openRowDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('The conversation was not deleted. Try again.')
      );
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('UNAUTHORIZED result goes to sign-in, no toast', async () => {
      const user = userEvent.setup();
      deleteConversationMock.mockResolvedValue(fail('UNAUTHORIZED', 'Please sign in.'));
      renderList();
      const dialog = await openRowDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(goToSignIn).toHaveBeenCalled());
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(toastError).not.toHaveBeenCalled();
    });

    it('a rejected call goes to sign-in', async () => {
      const user = userEvent.setup();
      deleteConversationMock.mockRejectedValue(new Error('401'));
      renderList();
      const dialog = await openRowDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(goToSignIn).toHaveBeenCalled());
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('cancelled: Cancel closes the dialog and deletes nothing', async () => {
      const user = userEvent.setup();
      renderList();
      const dialog = await openRowDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(deleteConversationMock).not.toHaveBeenCalled();
      expect(deleteAllConversationsMock).not.toHaveBeenCalled();
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(routerRefresh).not.toHaveBeenCalled();
    });

    it('cancelled: Esc closes the dialog and deletes nothing', async () => {
      const user = userEvent.setup();
      renderList();
      await openRowDelete(user);

      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(deleteConversationMock).not.toHaveBeenCalled();
    });
  });

  describe('default (all) from "Delete all"', () => {
    it('opens with the total count in the body, drafts-stay copy and a destructive "Delete all"', async () => {
      const user = userEvent.setup();
      renderList();
      const dialog = await openDeleteAll(user);

      expect(within(dialog).getByText('Delete all conversations?')).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          'All 12 conversations will be deleted for good. Drafts they created stay in your invoices.'
        )
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Delete all' })).toBeInTheDocument();
      expect(deleteAllConversationsMock).not.toHaveBeenCalled();
    });

    it('success: calls deleteAllConversations() once, closes, toasts "All conversations deleted." and refreshes', async () => {
      const user = userEvent.setup();
      deleteAllConversationsMock.mockResolvedValue(ok({ deleted: 12 }));
      renderList();
      const dialog = await openDeleteAll(user);

      await user.dblClick(within(dialog).getByRole('button', { name: 'Delete all' }));

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('All conversations deleted.'));
      expect(deleteAllConversationsMock).toHaveBeenCalledTimes(1);
      expect(deleteConversationMock).not.toHaveBeenCalled();
      expect(routerRefresh).toHaveBeenCalled();
      expect(routerPush).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('rejected: goes to sign-in', async () => {
      const user = userEvent.setup();
      deleteAllConversationsMock.mockRejectedValue(new Error('401'));
      renderList();
      const dialog = await openDeleteAll(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));

      await waitFor(() => expect(goToSignIn).toHaveBeenCalled());
    });

    it('UNAUTHORIZED result goes to sign-in', async () => {
      const user = userEvent.setup();
      deleteAllConversationsMock.mockResolvedValue(fail('UNAUTHORIZED', 'Please sign in.'));
      renderList();
      const dialog = await openDeleteAll(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete all' }));

      await waitFor(() => expect(goToSignIn).toHaveBeenCalled());
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('cancelled: nothing is deleted', async () => {
      const user = userEvent.setup();
      renderList();
      const dialog = await openDeleteAll(user);

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(deleteAllConversationsMock).not.toHaveBeenCalled();
    });

    it('is hidden for an empty list', () => {
      renderList(pageOf([], 0));

      expect(screen.queryByRole('button', { name: 'Conversation actions' })).not.toBeInTheDocument();
      expect(screen.queryByText('Delete all')).not.toBeInTheDocument();
    });
  });

  describe('from the Conversation header (SCR-02)', () => {
    it('opens the one-Conversation dialog with the open Conversation title', async () => {
      const user = userEvent.setup();
      renderHeader();
      const dialog = await openHeaderDelete(user);

      expect(within(dialog).getByText('Delete this conversation?')).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          `“${TITLE}” will be deleted for good. Drafts it created stay in your invoices.`
        )
      ).toBeInTheDocument();
    });

    it('success: deletes by id, toasts and pushes to /ai (no list refresh needed)', async () => {
      const user = userEvent.setup();
      deleteConversationMock.mockResolvedValue(ok());
      renderHeader();
      const dialog = await openHeaderDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/ai'));
      expect(deleteConversationMock).toHaveBeenCalledTimes(1);
      expect(deleteConversationMock).toHaveBeenCalledWith('c9');
      expect(toastSuccess).toHaveBeenCalledWith('Conversation deleted.');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('not-found: toast verbatim and back to /ai (the Conversation is gone)', async () => {
      const user = userEvent.setup();
      deleteConversationMock.mockResolvedValue(fail('NOT_FOUND', NOT_FOUND_COPY));
      renderHeader();
      const dialog = await openHeaderDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(toastError).toHaveBeenCalledWith(NOT_FOUND_COPY));
      expect(toastSuccess).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('rejected: goes to sign-in and does not navigate', async () => {
      const user = userEvent.setup();
      deleteConversationMock.mockRejectedValue(new Error('401'));
      renderHeader();
      const dialog = await openHeaderDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(goToSignIn).toHaveBeenCalled());
      expect(routerPush).not.toHaveBeenCalled();
    });

    it('cancelled: nothing is deleted and nothing navigates', async () => {
      const user = userEvent.setup();
      renderHeader();
      const dialog = await openHeaderDelete(user);

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(deleteConversationMock).not.toHaveBeenCalled();
      expect(routerPush).not.toHaveBeenCalled();
    });
  });

  describe('AI section layout', () => {
    it('renders its children and mounts the AI modal container so the dialog can open', async () => {
      const user = userEvent.setup();
      render(
        <AiLayout>
          <ConversationHeaderClient conversationId="c9" title={TITLE} />
        </AiLayout>
      );

      await user.click(screen.getByRole('button', { name: 'Conversation actions' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Delete conversation' }));

      expect(await screen.findByText('Delete this conversation?')).toBeInTheDocument();
    });
  });
});
