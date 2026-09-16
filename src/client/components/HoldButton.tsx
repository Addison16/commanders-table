import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { newId } from '../../shared/random.js';
import { useApp } from '../app/store.js';
export function HoldButton({
  label,
  children,
  disabled,
  onStep,
  className = '',
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onStep: (groupId: string) => void;
  className?: string;
}) {
  const pointers = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; group: string }>());
  const step = useRef(onStep);
  step.current = onStep;
  const stop = useCallback((id: number) => {
    const entry = pointers.current.get(id);
    if (entry) clearTimeout(entry.timer);
    pointers.current.delete(id);
  }, []);
  const clear = useCallback(() => {
    for (const id of pointers.current.keys()) stop(id);
  }, [stop]);
  useEffect(() => {
    document.addEventListener('visibilitychange', clear);
    window.addEventListener('blur', clear);
    window.addEventListener('mtg-cancel-input', clear);
    return () => {
      clear();
      document.removeEventListener('visibilitychange', clear);
      window.removeEventListener('blur', clear);
      window.removeEventListener('mtg-cancel-input', clear);
    };
  }, [clear]);
  useEffect(() => {
    if (disabled) clear();
  }, [disabled, clear]);
  const feedback = () => {
    const p = useApp.getState().profile;
    if (p.haptics) navigator.vibrate?.(8);
  };
  return (
    <button
      className={`hold ${className}`}
      disabled={disabled}
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0 || disabled) return;
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          return;
        }
        const pid = e.pointerId,
          group = newId();
        step.current(group);
        feedback();
        const repeat = () => {
          if (!pointers.current.has(pid)) return;
          step.current(group);
          pointers.current.get(pid)!.timer = setTimeout(repeat, 130);
        };
        pointers.current.set(pid, { group, timer: setTimeout(repeat, 350) });
      }}
      onPointerUp={(e) => stop(e.pointerId)}
      onPointerCancel={(e) => stop(e.pointerId)}
      onLostPointerCapture={(e) => stop(e.pointerId)}
      onClick={(e) => {
        if (e.detail === 0 && !disabled) {
          step.current(newId());
          feedback();
        }
      }}
    >
      {children}
    </button>
  );
}
