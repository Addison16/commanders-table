import { useEffect, useState } from 'react';
import { type Game, type RecentRoom } from '../../shared/schema.js';
import { recoveryDeadline } from '../../shared/game.js';
import { report, repository, resumeLocal, useApp } from '../app/store.js';
import { Icon } from '../components/ui.js';

export function RecentGames() {
  const [local, setLocal] = useState<Game[]>([]);
  const [rooms, setRooms] = useState<RecentRoom[]>([]);
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(Date.now());
  const recovery = useApp((s) => s.recovery);
  const confirmed = useApp((s) => s.confirmed);
  const offset = useApp((s) => s.clockOffset);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([repository.recentLocal(), repository.recentEnded(), repository.recentRooms()])
      .then(async ([games, ended, cached]) => {
        if (!active) return;
        setLocal([...games, ...ended]);
        setRooms(cached);
        try {
          const { recentRooms } = await import('../adapters/room.js');
          const current = await recentRooms();
          if (active) setRooms(current);
        } catch {
          /* Offline or without a guest cookie: retain saved references. */
        }
      })
      .catch(report);
    return () => {
      active = false;
    };
  }, [confirmed?.id, confirmed?.revision]);
  const recent = [
    ...local.map((game) => ({
      id: game.id,
      mode: 'local' as const,
      names: game.order.map((id) => game.players[id].name),
      preset: game.settings.preset,
      updatedAt: Math.max(game.timer.startedAt, game.history.at(-1)?.at ?? 0, game.rolls[0]?.at ?? 0),
      approved: true,
      status: game.status,
      recoverUntil: recoveryDeadline(game),
      canReopen: true,
    })),
    ...rooms.map((room) => ({ ...room, mode: 'room' as const })),
  ]
    .filter((g) => g.status === 'active' || (g.recoverUntil ?? 0) > now + (g.mode === 'room' ? offset : 0))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const resume = async (mode: 'local' | 'room', id: string, reopen = false) => {
    setBusy(id);
    try {
      if (mode === 'local') await resumeLocal(id, reopen);
      else await (await import('../adapters/room.js')).resumeRoom(id, reopen);
    } catch (e) {
      report(e);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      {(['active', 'ended'] as const).map((status) => {
        const games = recent.filter((g) => g.status === status).slice(0, 10);
        if (!games.length) return null;
        const ended = status === 'ended';
        return (
          <section
            className="recent-games"
            aria-label={ended ? 'Recently ended games' : 'Unfinished games'}
            key={status}
          >
            <div className="recent-heading">
              <h2>{ended ? 'Recently ended.' : 'Pick up where you left off.'}</h2>
              <p>
                {ended
                  ? 'Ended by accident? Reopen your game within 24 hours.'
                  : 'Your last 10 unfinished games.'}
              </p>
            </div>
            <div className="recent-game-list">
              {games.map((game) => {
                const label = `${game.mode === 'local' ? 'one-phone game' : 'shared room'}: ${game.names.join(', ')}`;
                const reopen = ended && game.canReopen;
                const action = ended ? (reopen ? 'Reopen' : 'View') : 'Resume';
                const remaining = Math.max(
                  1,
                  Math.ceil(((game.recoverUntil ?? 0) - now - (game.mode === 'room' ? offset : 0)) / 60_000),
                );
                return (
                  <div className="recent-game-row" key={`${game.mode}:${game.id}`}>
                    <button
                      className="recent-game"
                      disabled={!!busy || (game.mode === 'local' && recovery)}
                      aria-label={`${action} ${label}`}
                      onClick={() => void resume(game.mode, game.id, reopen)}
                    >
                      <Icon name={game.mode === 'local' ? 'phone' : 'people'} />
                      <span className="recent-game-copy">
                        <small>
                          {game.mode === 'local' ? 'One phone' : 'Shared room'} · {game.preset}
                        </small>
                        <strong>{game.names.join(', ')}</strong>
                        <small>
                          {ended
                            ? `${remaining >= 60 ? `${Math.ceil(remaining / 60)}h` : `${remaining}m`} left to reopen${!game.canReopen ? ' · host can restore play' : ''}`
                            : `${!game.approved ? 'Waiting for a seat · ' : ''}${new Date(game.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${new Date(game.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                        </small>
                      </span>
                      <span className="recent-resume">
                        {busy === game.id ? 'Opening…' : action}
                        <Icon name="arrow" size={16} />
                      </span>
                    </button>
                    {reopen && (
                      <button
                        className="text-button recent-view"
                        disabled={!!busy || (game.mode === 'local' && recovery)}
                        aria-label={`View final ${label}`}
                        onClick={() => void resume(game.mode, game.id)}
                      >
                        View final game
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
