'use client';

// A tiny singleton pub-sub for toast notifications, so any component can
// call showToast(...) without threading callbacks through every level of
// props -- the same pattern lib/audio.ts uses for sound.

export type ToastKind = 'info' | 'error';
export type Toast = { id: number; message: string; kind: ToastKind };

type Listener = (toast: Toast) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function showToast(message: string, kind: ToastKind = 'info') {
  if (!message) return;
  const toast: Toast = { id: nextId++, message, kind };
  listeners.forEach((listen) => listen(toast));
}

export function subscribeToasts(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
