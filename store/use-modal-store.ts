import { create } from 'zustand';

interface ModalState {
  data: Record<string, unknown>;
  updateModalProps: (props: Record<string, unknown>) => void;
  resetModalProps: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  data: {},
  updateModalProps: (payload: Record<string, unknown>) =>
    set((state) => ({
      ...state,
      data: Object.entries(payload).reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, state.data),
    })),
  resetModalProps: () => set({ data: {} }),
}));
