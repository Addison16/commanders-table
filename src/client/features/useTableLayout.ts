import { useSyncExternalStore } from 'react';
import { useApp } from '../app/store.js';

type Layout = 'upright' | 'shared';

function mobileLayout(): Layout | null {
  if (typeof window === 'undefined' || !matchMedia('(pointer: coarse)').matches) return null;
  const type = screen.orientation?.type;
  if (type?.startsWith('landscape')) return 'shared';
  if (type?.startsWith('portrait')) return 'upright';
  // Older iOS exposes the phone's orientation directly. Screen dimensions are
  // the final fallback; viewport dimensions also change when a keyboard opens.
  const angle = (window as Window & { orientation?: number }).orientation;
  if (typeof angle === 'number') return Math.abs(angle) === 90 ? 'shared' : 'upright';
  return screen.width > screen.height ? 'shared' : 'upright';
}

function subscribe(listener: () => void) {
  const pointer = matchMedia('(pointer: coarse)');
  const orientation = screen.orientation;
  let previous = mobileLayout();
  const changed = () => {
    const next = mobileLayout();
    if (next === previous) return;
    previous = next;
    // Stop a held life control before moving it to another side of the phone.
    dispatchEvent(new Event('mtg-cancel-input'));
    listener();
  };
  pointer.addEventListener('change', changed);
  orientation?.addEventListener('change', changed);
  window.addEventListener('orientationchange', changed);
  window.addEventListener('resize', changed);
  window.addEventListener('pageshow', changed);
  return () => {
    pointer.removeEventListener('change', changed);
    orientation?.removeEventListener('change', changed);
    window.removeEventListener('orientationchange', changed);
    window.removeEventListener('resize', changed);
    window.removeEventListener('pageshow', changed);
  };
}

export function useTableLayout() {
  const device = useSyncExternalStore(subscribe, mobileLayout, () => null);
  const followRotation = useApp((s) => s.profile.autoTableLayout);
  const manual = useApp((s) => s.profile.tableLayout);
  const automatic = followRotation && device !== null;
  return { layout: automatic ? device : manual, automatic };
}
