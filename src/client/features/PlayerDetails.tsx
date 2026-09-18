import { useState } from 'react';
import { palettes, type Game } from '../../shared/schema.js';
import { act, canEdit, isHost, savePlayer, useApp, updateProfile } from '../app/store.js';
import { ask, Field, Icon, Sheet, Toggle } from '../components/ui.js';
import { HoldButton } from '../components/HoldButton.js';
import { facesAcross } from './TableLayout.js';
import { useTableLayout } from './useTableLayout.js';
import { CommanderInput } from '../components/CommanderInput.js';
import { CommanderCredits } from '../components/CommanderArtwork.js';
import { CommanderReader } from '../components/CommanderReader.js';
import type { CommanderCard } from '../../shared/cards.js';
import { rememberDicePlayer } from '../dice/preference.js';

// Untouched fields follow the live game. Once edited, a field keeps its draft
// through local steps and remote updates until that draft is submitted.
function useLiveDraft<T extends string>(value: T) {
  const [draft, setDraft] = useState<T>();
  const reset = () => setDraft((current) => (current === draft ? undefined : current));
  return [draft ?? value, setDraft, reset] as const;
}

function Counter({
  playerId,
  field,
  value,
  disabled,
}: {
  playerId: string;
  field: string;
  value: number;
  disabled: boolean;
}) {
  const [exact, setExact, resetExact] = useLiveDraft(String(value));
  return (
    <div className="counter-block">
      <div className="counter-row">
        <span>{field === 'life' ? 'Life' : field === 'poison' ? 'Poison' : field}</span>
        <div className="stepper">
          <HoldButton
            disabled={disabled || (field !== 'life' && value === 0)}
            label={`Decrease ${field}`}
            onStep={(group) => void act({ type: 'adjust', playerId, field, delta: -1 }, group)}
          >
            <Icon name="minus" />
          </HoldButton>
          <strong>{value}</strong>
          <HoldButton
            disabled={disabled}
            label={`Increase ${field}`}
            onStep={(group) => void act({ type: 'adjust', playerId, field, delta: 1 }, group)}
          >
            <Icon name="plus" />
          </HoldButton>
        </div>
      </div>
      <div className="counter-exact">
        {field === 'life' && (
          <>
            <button
              disabled={disabled}
              onClick={() => void act({ type: 'adjust', playerId, field, delta: -5 })}
            >
              −5
            </button>
            <button
              disabled={disabled}
              onClick={() => void act({ type: 'adjust', playerId, field, delta: 5 })}
            >
              +5
            </button>
          </>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act({ type: 'set', playerId, field, value: Number(exact) }).then(resetExact);
          }}
        >
          <input
            aria-label={`Exact ${field}`}
            type="number"
            inputMode={field === 'life' ? 'text' : 'numeric'}
            min={field === 'life' ? -999999 : 0}
            max="999999"
            required
            value={exact}
            onChange={(e) => setExact(e.target.value)}
          />
          <button disabled={disabled}>Set</button>
        </form>
      </div>
    </div>
  );
}
export function PlayerDetails({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const game = useApp((s) => s.game)!,
    profile = useApp((s) => s.profile),
    room = useApp((s) => s.room),
    connected = useApp((s) => s.connected),
    readOnly = useApp((s) => s.readOnly),
    mode = useApp((s) => s.mode);
  const player = game.players[playerId];
  const { layout, automatic } = useTableLayout();
  const [source, setSource] = useState(Object.keys(game.commanders)[0]);
  const [amount, setAmount] = useState('1');
  const [subtractLife, setSubtractLife] = useState(true);
  const [name, setName, resetName] = useLiveDraft(player.name),
    [color, setColor, resetColor] = useLiveDraft(player.color);
  const [commanderDrafts, setCommanderDrafts] = useState<
    Record<string, { label: string; card: CommanderCard | null }>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const commanders = Object.values(game.commanders).filter((c) => c.ownerId === playerId);
  const disabled = !canEdit(playerId) || player.eliminated || game.status === 'ended';
  const manage =
    !readOnly &&
    game.status === 'active' &&
    (mode === 'local' || connected) &&
    (isHost() || room?.me.seatId === playerId);
  return (
    <Sheet title={player.name} description="Your life, your legends, your next move." onClose={onClose}>
      <CommanderReader commanders={commanders} />
      <CommanderCredits
        cards={Object.values(game.commanders)
          .filter((c) => c.ownerId === playerId && c.card)
          .map((c) => c.card!)}
      />
      <details className="edit-player">
        <summary>
          <Icon name="settings" />
          Edit player & commanders
        </summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!manage || saving) return;
            setSaving(true);
            setSaveStatus('');
            try {
              const saved = await savePlayer({
                type: 'editPlayer',
                playerId,
                name,
                color,
                commanders: commanders.map((commander) => ({
                  id: commander.id,
                  ...(commanderDrafts[commander.id] ?? {
                    label: commander.label,
                    card: commander.card ?? null,
                  }),
                })),
              });
              if (!saved) {
                setSaveStatus('Save not confirmed. Your edits are still here.');
                return;
              }
              if (mode === 'local') rememberDicePlayer(game.id, playerId);
              resetName();
              resetColor();
              setCommanderDrafts((current) =>
                Object.fromEntries(
                  Object.entries(current).filter(([id, draft]) => draft !== commanderDrafts[id]),
                ),
              );
              setSaveStatus('Changes saved.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Field label="Player name">
            <input
              value={name}
              maxLength={40}
              required
              disabled={!manage || saving}
              onChange={(e) => {
                setName(e.target.value);
                setSaveStatus('');
              }}
            />
          </Field>
          <Field label="Player color">
            <select
              value={color}
              disabled={!manage || saving}
              onChange={(e) => {
                setColor(e.target.value as typeof color);
                setSaveStatus('');
              }}
            >
              {palettes.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {commanders.map((commander, index) => {
            const selection = commanderDrafts[commander.id] ?? {
              label: commander.label,
              card: commander.card ?? null,
            };
            return (
              <CommanderInput
                key={commander.id}
                label={`Commander ${index + 1} name`}
                value={selection.label}
                card={selection.card}
                disabled={!manage || saving}
                onChange={(label, card) => {
                  setCommanderDrafts((current) => ({ ...current, [commander.id]: { label, card } }));
                  setSaveStatus('');
                }}
              />
            );
          })}
          <button className="secondary full" disabled={!manage || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saveStatus && (
            <p className="hint" role="status">
              {saveStatus}
            </p>
          )}
        </form>
        {!manage && (
          <p className="hint">
            {readOnly
              ? 'Take over this tab to edit.'
              : game.status === 'ended'
                ? 'This game has ended.'
                : 'The player in this seat or the host can edit these names.'}
          </p>
        )}
      </details>
      {player.eliminated && (
        <div className="notice">
          <strong>This player is eliminated.</strong>
          <p>Restore to resume edits. Markers and turn remain assigned until you explicitly change them.</p>
          <button
            className="primary"
            disabled={!manage}
            onClick={() => void act({ type: 'eliminate', playerId, eliminated: false })}
          >
            Restore player
          </button>
        </div>
      )}
      <Counter playerId={playerId} field="life" value={player.life} disabled={disabled} />
      {game.settings.poison && (
        <>
          <Counter playerId={playerId} field="poison" value={player.poison} disabled={disabled} />
          <p className="hint">
            Warning at {game.settings.poisonThreshold} poison. Elimination is always manual.
          </p>
        </>
      )}
      {game.settings.commander && (
        <>
          <section className="detail-section">
            <h3>
              <Icon name="shield" />
              Commander damage received
            </h3>
            <p className="hint">
              Each commander is tracked separately, including your own. Warning at{' '}
              {game.settings.commanderThreshold} from one source.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({
                  type: 'damage',
                  playerId,
                  commanderId: source,
                  amount: Number(amount),
                  subtractLife,
                });
              }}
            >
              <Field label="Combat damage source">
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  {game.order.map((owner) => (
                    <optgroup label={game.players[owner].name} key={owner}>
                      {Object.values(game.commanders)
                        .filter((c) => c.ownerId === owner)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label} · {game.damageReceived[playerId]?.[c.id] ?? 0} recorded
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Damage amount">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="999999"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Toggle checked={subtractLife} onChange={setSubtractLife}>
                Also subtract this much life
              </Toggle>
              <p className="hint">
                For infect or other effects, switch off life loss and adjust poison separately.
              </p>
              <button className="primary full" disabled={disabled}>
                Record combat damage
              </button>
            </form>
            <details>
              <summary>
                Correct recorded totals <span>Damage only</span>
              </summary>
              {game.order.map((owner) => (
                <div className="damage-owner" key={owner}>
                  <h4>
                    {game.players[owner].name}
                    {owner === playerId ? ' · your commanders' : ''}
                  </h4>
                  {Object.values(game.commanders)
                    .filter((c) => c.ownerId === owner)
                    .map((c) => (
                      <DamageCorrection
                        key={c.id}
                        playerId={playerId}
                        commanderId={c.id}
                        label={c.label}
                        value={game.damageReceived[playerId]?.[c.id] ?? 0}
                        disabled={disabled}
                      />
                    ))}
                </div>
              ))}
            </details>
          </section>
          <section className="detail-section">
            <h3>
              <Icon name="crown" />
              Command-zone casts
            </h3>
            {Object.values(game.commanders)
              .filter((c) => c.ownerId === playerId)
              .map((c) => (
                <CommanderCasts key={c.id} commander={c} disabled={disabled} />
              ))}
          </section>
        </>
      )}
      {game.settings.counters.length > 0 && (
        <section className="detail-section">
          <h3>Manual counters</h3>
          {game.settings.counters.map((field) => (
            <Counter
              key={field}
              playerId={playerId}
              field={field}
              value={player.counters[field] ?? 0}
              disabled={disabled}
            />
          ))}
        </section>
      )}
      <section className="detail-section">
        <h3>Make it yours</h3>
        <Toggle
          checked={
            (!automatic ? profile.rotations[playerId] : undefined) ??
            facesAcross(layout, game.order.indexOf(playerId), game.order.length)
          }
          onChange={(flipped) => {
            dispatchEvent(new Event('mtg-cancel-input'));
            void updateProfile({
              autoTableLayout: false,
              tableLayout: layout,
              rotations: { ...(!automatic ? profile.rotations : {}), [playerId]: flipped },
            });
          }}
        >
          Face this seat across the table
        </Toggle>
        <p className="hint">
          Only changes the view on this device. Flipping a seat turns off automatic layout. Player sheets stay
          upright.
        </p>
      </section>
      {!player.eliminated && (
        <button
          className="danger full"
          disabled={!manage}
          onClick={async () => {
            if (
              await ask(
                `Eliminate ${player.name}?`,
                'The seat stays at the table. You can restore this player at any time. Reassign or clear any markers and turn highlight in Utilities.',
              )
            )
              void act({ type: 'eliminate', playerId, eliminated: true });
          }}
        >
          Eliminate player
        </button>
      )}
    </Sheet>
  );
}
function DamageCorrection({
  playerId,
  commanderId,
  label,
  value,
  disabled,
}: {
  playerId: string;
  commanderId: string;
  label: string;
  value: number;
  disabled: boolean;
}) {
  const [total, setTotal, resetTotal] = useLiveDraft(String(value));
  return (
    <form
      className="damage-correction"
      onSubmit={(e) => {
        e.preventDefault();
        void act({ type: 'damageSet', playerId, commanderId, value: Number(total) }).then(resetTotal);
      }}
    >
      <label>
        <span>
          {label} <small>· {value} recorded</small>
        </span>
        <input
          aria-label={`${label} recorded damage`}
          type="number"
          inputMode="numeric"
          required
          min="0"
          max="999999"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </label>
      <button disabled={disabled}>Correct</button>
    </form>
  );
}

function CommanderCasts({
  commander,
  disabled,
}: {
  commander: Game['commanders'][string];
  disabled: boolean;
}) {
  const [casts, setCasts, resetCasts] = useLiveDraft(String(commander.casts));
  return (
    <div className="commander-casts">
      <h4>{commander.label}</h4>
      <p className="tax">
        Next cast: <strong>+{commander.casts * 2}</strong> additional mana
      </p>
      <p className="hint">
        {commander.casts} previous command-zone {commander.casts === 1 ? 'cast' : 'casts'}. Other zones do not
        count.
      </p>
      <button
        className="secondary full"
        disabled={disabled}
        onClick={() => void act({ type: 'cast', commanderId: commander.id })}
      >
        Record cast
      </button>
      <details>
        <summary>Correct casts</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act({ type: 'castSet', commanderId: commander.id, value: Number(casts) }).then(resetCasts);
          }}
        >
          <Field label="Previous command-zone casts">
            <input
              type="number"
              name="casts"
              inputMode="numeric"
              min="0"
              max="999999"
              required
              value={casts}
              onChange={(e) => setCasts(e.target.value)}
            />
          </Field>
          <button disabled={disabled}>Correct casts</button>
        </form>
      </details>
    </div>
  );
}
