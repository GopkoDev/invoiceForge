import { create } from 'zustand';
import type { ModalRegistry } from '@/components/modals/modal-types-registry';

export type ModalKey = keyof ModalRegistry;

type ModalState = {
  [K in ModalKey]?: ModalRegistry[K];
};

interface ModalStore {
  modals: ModalState;
  openModal: <K extends ModalKey>(key: K, props: ModalRegistry[K]) => void;
  closeModal: <K extends ModalKey>(key: K) => void;
  getModalProps: <K extends ModalKey>(key: K) => ModalRegistry[K] | undefined;
  resetAllModals: () => void;
}

export const useModalStore = create<ModalStore>((set, get) => ({
  modals: {},

  openModal: (key, props) =>
    set((state) => ({
      modals: {
        ...state.modals,
        [key]: props,
      },
    })),

  closeModal: (key) =>
    set((state) => {
      const { [key]: _removed, ...rest } = state.modals;
      void _removed; // Explicitly mark as intentionally unused
      return { modals: rest };
    }),

  getModalProps: (key) => get().modals[key],

  resetAllModals: () => set({ modals: {} }),
}));

export function useModal<K extends ModalKey>(key: K) {
  const { modals, openModal, closeModal } = useModalStore();

  return {
    isOpen: !!modals[key],
    props: modals[key] as ModalRegistry[K] | undefined,
    open: (props: ModalRegistry[K]) => openModal(key, props),
    close: () => closeModal(key),
  };
}
