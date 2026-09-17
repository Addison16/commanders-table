import type { Game } from '../../shared/schema.js';

const storageKey = 'mtg-util:dice-players';
const preferences = new Map<string, string>();
let loaded = false;

function loadPreferences() {
  if (loaded) return;
  loaded = true;
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved))
      for (const entry of saved.slice(-20))
        if (
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'string'
        )
          preferences.set(entry[0], entry[1]);
  } catch {
    // Private browsing and storage denial still keep the current tab usable.
  }
}

/** An empty player ID deliberately selects neutral ivory dice for the table. */
export function rememberDicePlayer(gameId: string, playerId: string) {
  loadPreferences();
  preferences.delete(gameId);
  preferences.set(gameId, playerId);
  while (preferences.size > 20) preferences.delete(preferences.keys().next().value!);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify([...preferences]));
  } catch {
    // The in-memory preference works even when it cannot survive a reload.
  }
}

export function preferredDicePlayer(
  game: Game,
  {
    mode,
    ownedSeat,
    localSeat,
  }: { mode: 'local' | 'room'; ownedSeat?: string | null; localSeat?: string | null },
): string {
  loadPreferences();
  const remembered = preferences.get(game.id);
  if (remembered === '' || (remembered && game.players[remembered])) return remembered;

  const seat = mode === 'room' ? ownedSeat : localSeat;
  if (seat && game.players[seat]) return seat;
  if (game.settings.turnTracking && game.turn.playerId && game.players[game.turn.playerId])
    return game.turn.playerId;

  const previous = game.rolls.find((roll) => roll.kind === 'dice' || roll.kind === 'coin');
  if (previous?.playerId && game.players[previous.playerId]) return previous.playerId;
  if (previous && !previous.playerId) return '';

  // A shared device has no claimed seat. Begin with a player so their selected
  // color applies immediately; explicit table rolls remain available above.
  return mode === 'local'
    ? (game.order.find((id) => !game.players[id].eliminated) ?? game.order[0] ?? '')
    : '';
}
