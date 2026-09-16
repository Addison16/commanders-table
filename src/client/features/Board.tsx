import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { warnings } from '../../shared/game.js';
import { useApp, act, updateProfile } from '../app/store.js';
import { Icon, Sigil } from '../components/ui.js';
import { HoldButton } from '../components/HoldButton.js';
import { facesAcross } from './TableLayout.js';

const PlayerTile = memo(function PlayerTile({
  id,
  index,
  openPlayer,
  myView,
  autoFlipped = false,
  span,
}: {
  id: string;
  index: number;
  openPlayer: (id: string) => void;
  myView: boolean;
  autoFlipped?: boolean;
  span?: number;
}) {
  // Snapshots are immutable. Select the visible primitives so changing another
  // seat does not rerender this panel or interrupt its input feedback.
  const player = useApp(
    useShallow((s) => {
      const game = s.game,
        seat = game?.players[id];
      if (!game || !seat) return null;
      const member = s.room?.members.find((m) => m.seatId === id && m.status === 'approved');
      const editable =
        !s.readOnly &&
        (s.mode === 'local' ||
          (s.connected &&
            s.room?.me.status === 'approved' &&
            (s.room.hostId === s.room.me.id || s.room.everyoneEdits || s.room.me.seatId === id)));
      return {
        name: seat.name,
        color: seat.color,
        life: seat.life,
        poison: seat.poison,
        eliminated: seat.eliminated,
        flipped: s.profile.rotations[id] ?? autoFlipped,
        disabled: !editable || seat.eliminated || game.status === 'ended',
        flags: warnings(game, id).join(' · '),
        showPoison: game.settings.poison,
        monarch: game.markers.monarch === id,
        initiative: game.markers.initiative === id,
        turn: game.settings.turnTracking && game.turn.playerId === id ? game.turn.number : 0,
        presence: member ? Boolean(member.connected) : null,
      };
    }),
  );
  const [delta, setDelta] = useState(0);
  const life = player?.life ?? 0;
  const last = useRef(life);
  useEffect(() => {
    const d = life - last.current;
    last.current = life;
    if (!d) return;
    setDelta((v) => v + d);
    const t = setTimeout(() => setDelta(0), 1400);
    return () => clearTimeout(t);
  }, [life]);
  if (!player) return null;
  const { disabled, flags, flipped } = player;
  const chars = String(player.life).length;
  return (
    <section
      className={`player-tile ${player.color} ${player.eliminated ? 'eliminated' : ''} ${player.turn ? 'active-turn' : ''}`}
      aria-label={`${player.name} seat`}
      data-player-id={id}
      style={span ? ({ '--seat-span': span } as CSSProperties) : undefined}
    >
      <div
        className={`tile-content ${flipped && !myView ? 'flipped' : ''}`}
        data-facing={flipped && !myView ? 'across' : 'near'}
      >
        <Sigil index={index} className="tile-sigil" />
        <button
          className="player-heading"
          onClick={() => openPlayer(id)}
          aria-label={`${player.name} details`}
        >
          <span className="seat-index">{String(index + 1).padStart(2, '0')}</span>
          <span className="player-name">{player.name}</span>
          {player.presence !== null && (
            <span
              className={`presence-dot ${player.presence ? 'online' : ''}`}
              title={player.presence ? 'Connected' : 'Disconnected'}
            />
          )}
          <Icon name="arrow" size={14} />
        </button>
        <div className="life-controls">
          <HoldButton
            className="decrease"
            label={`Decrease ${player.name}'s life`}
            disabled={disabled}
            onStep={(group) => void act({ type: 'adjust', playerId: id, field: 'life', delta: -1 }, group)}
          >
            <Icon name="minus" size={26} />
          </HoldButton>
          <div className={`life-value digits-${Math.min(chars, 7)}`}>
            <span
              className="life-total"
              data-testid={`life-${index}`}
              aria-label={`${player.name}: ${player.life} life`}
            >
              {player.life}
            </span>
            <span className={`life-delta ${delta > 0 ? 'gain' : 'loss'}`} aria-hidden="true">
              {delta ? `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` : ''}
            </span>
          </div>
          <HoldButton
            className="increase"
            label={`Increase ${player.name}'s life`}
            disabled={disabled}
            onStep={(group) => void act({ type: 'adjust', playerId: id, field: 'life', delta: 1 }, group)}
          >
            <Icon name="plus" size={26} />
          </HoldButton>
        </div>
        <div
          className={`tile-foot ${player.eliminated || flags || (player.showPoison && player.poison > 0) || player.monarch || player.initiative || player.turn ? 'has-status' : ''}`}
        >
          {player.eliminated ? (
            <span>Eliminated · tap name to restore</span>
          ) : flags.length ? (
            <span className="warning-badge">! {flags}</span>
          ) : (
            <span className="life-caption">LIFE TOTAL</span>
          )}
          <span className="tile-trackers">
            {player.showPoison && player.poison > 0 && (
              <span aria-label={`${player.poison} poison`}>☠ {player.poison}</span>
            )}
            {player.monarch && (
              <span title="Monarch" aria-label="Monarch">
                ♛
              </span>
            )}
            {player.initiative && (
              <span title="Initiative" aria-label="Initiative">
                ◆
              </span>
            )}
            {player.turn > 0 && <span>TURN {player.turn}</span>}
          </span>
        </div>
      </div>
    </section>
  );
});
export function Board({ openPlayer }: { openPlayer: (id: string) => void }) {
  const game = useApp((s) => s.game)!,
    profile = useApp((s) => s.profile),
    room = useApp((s) => s.room),
    mode = useApp((s) => s.mode);
  const seat = mode === 'room' ? room?.me.seatId : profile.mySeat;
  const mine = profile.view === 'mine' && seat && game.players[seat];
  const shared = profile.tableLayout === 'shared';
  const farCount = Math.ceil(game.order.length / 2),
    nearCount = Math.max(1, Math.floor(game.order.length / 2));
  return (
    <>
      {mode === 'room' && (
        <div className="view-switch">
          <button className={!mine ? 'selected' : ''} onClick={() => void updateProfile({ view: 'table' })}>
            Table view
          </button>
          <button
            disabled={!seat}
            className={mine ? 'selected' : ''}
            onClick={() => void updateProfile({ view: 'mine' })}
          >
            My seat{!seat ? ' · claim a seat' : ''}
          </button>
        </div>
      )}
      {mine ? (
        <div className="my-view">
          <PlayerTile id={seat!} index={game.order.indexOf(seat!)} openPlayer={openPlayer} myView />
          <div className="seat-overview">
            {game.order
              .filter((id) => id !== seat)
              .map((id) => (
                <button
                  className={`overview-item ${game.players[id].color}`}
                  key={id}
                  onClick={() => openPlayer(id)}
                >
                  <span>{game.players[id].name}</span>
                  <strong>{game.players[id].life}</strong>
                </button>
              ))}
          </div>
        </div>
      ) : (
        <div
          className={`board seats-${game.order.length} ${shared ? 'shared-table' : ''}`}
          data-layout={shared ? 'shared' : 'upright'}
          style={shared ? ({ '--table-columns': farCount * nearCount } as CSSProperties) : undefined}
        >
          {game.order.map((id, i) => (
            <PlayerTile
              key={id}
              id={id}
              index={i}
              openPlayer={openPlayer}
              myView={false}
              autoFlipped={facesAcross(profile.tableLayout, i, game.order.length)}
              span={shared ? (i < farCount ? nearCount : farCount) : undefined}
            />
          ))}
          {!shared && game.order.length > 2 && game.order.length % 2 === 1 && (
            <div className="empty-seat">
              <Sigil />
              <span>A little room for magic.</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
