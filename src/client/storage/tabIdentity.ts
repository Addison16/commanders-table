import { newId } from '../../shared/random.js';

const reservationKey = Symbol.for('mtg-util.editor-identity');
type Reservation = { promise: Promise<string> };
type EditorDocument = Document & { [reservationKey]?: Reservation };

/**
 * Preserve the session identity across reloads, but reserve it so a cloned tab
 * cannot impersonate a live editor. Call again after pageshow/persisted or
 * resume: pagehide/freeze release this document's reservation for BFcache.
 * Without Web Locks, existing IndexedDB revision checks remain the safeguard.
 */
export function acquireEditorIdentity(initialId: string): Promise<string> {
  const owner = document as EditorDocument;
  if (owner[reservationKey]) return owner[reservationKey].promise;

  let resolve!: (id: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  const reservation = { promise };
  owner[reservationKey] = reservation;
  let finished = false;
  let selectedId = initialId;
  let releaseLock: (() => void) | undefined;
  const finish = (id: string) => {
    if (finished) return;
    finished = true;
    selectedId = id;
    clearTimeout(timeout);
    try {
      owner.defaultView?.sessionStorage.setItem('mtg-tab', id);
    } catch {
      // Storage denial must not prevent this document from using its identity.
    }
    resolve(id);
  };
  const release = () => {
    finish(selectedId);
    releaseLock?.();
    if (owner[reservationKey] === reservation) delete owner[reservationKey];
    owner.removeEventListener('freeze', release);
    owner.defaultView?.removeEventListener('pagehide', release);
  };
  // A denied or stalled browser API must never leave the app on its loading
  // screen. A late callback checks finished and releases instead of claiming.
  const timeout = setTimeout(() => finish(selectedId), 1000);
  owner.addEventListener('freeze', release);
  owner.defaultView?.addEventListener('pagehide', release);

  try {
    const locks = navigator.locks;
    if (!locks) finish(initialId);
    else {
      const reserve = (id: string, copied = false) => {
        try {
          void locks
            .request(`mtg-util:editor:${id}`, { ifAvailable: true }, (lock) => {
              if (finished) return;
              if (!lock) {
                selectedId = newId();
                if (copied) finish(selectedId);
                else reserve(selectedId, true);
                return;
              }
              const held = new Promise<void>((done) => {
                releaseLock = done;
              });
              finish(id);
              return held;
            })
            .catch(() => finish(selectedId));
        } catch {
          finish(selectedId);
        }
      };
      reserve(initialId);
    }
  } catch {
    finish(initialId);
  }
  return promise;
}
