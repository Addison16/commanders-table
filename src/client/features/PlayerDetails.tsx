import { useState } from 'react';
import { palettes } from '../../shared/schema.js';
import { act, canEdit, isHost, useApp, updateProfile } from '../app/store.js';
import { ask, Field, Icon, Sheet, Toggle } from '../components/ui.js';
import { HoldButton } from '../components/HoldButton.js';
import { facesAcross } from './TableLayout.js';

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
  const [exact, setExact] = useState(String(value));
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
            void act({ type: 'set', playerId, field, value: Number(exact) });
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
  const [source, setSource] = useState(Object.keys(game.commanders)[0]);
  const [amount, setAmount] = useState('1');
  const [subtractLife, setSubtractLife] = useState(true);
  const [name, setName] = useState(player.name),
    [color, setColor] = useState(player.color);
  const disabled = !canEdit(playerId) || player.eliminated || game.status === 'ended';
  const manage =
    !readOnly &&
    game.status === 'active' &&
    (mode === 'local' || connected) &&
    (isHost() || room?.me.seatId === playerId);
  return (
    <Sheet title={player.name} description="Your life, your legends, your next move." onClose={onClose}>
      <details className="edit-player">
        <summary>
          <Icon name="settings" />
          Edit player & commanders
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act({ type: 'customize', playerId, name, color });
          }}
        >
          <Field label="Player name">
            <input value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Player color">
            <select value={color} onChange={(e) => setColor(e.target.value as typeof color)}>
              {palettes.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <button className="secondary full" disabled={!manage}>
            Save player
          </button>
        </form>
        {Object.values(game.commanders)
          .filter((c) => c.ownerId === playerId)
          .map((c, index) => (
            <form
              key={c.id}
              onSubmit={(e) => {
                e.preventDefault();
                void act({
                  type: 'commanderName',
                  commanderId: c.id,
                  label: String(new FormData(e.currentTarget).get('label')),
                });
              }}
            >
              <Field label={`Commander ${index + 1} name`}>
                <input name="label" defaultValue={c.label} maxLength={40} required />
              </Field>
              <button className="secondary full" disabled={!manage}>
                Save commander {index + 1}
              </button>
            </form>
          ))}
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
                <div className="commander-casts" key={c.id}>
                  <h4>{c.label}</h4>
                  <p className="tax">
                    Next cast: <strong>+{c.casts * 2}</strong> additional mana
                  </p>
                  <p className="hint">
                    {c.casts} previous command-zone {c.casts === 1 ? 'cast' : 'casts'}. Other zones do not
                    count.
                  </p>
                  <button
                    className="secondary full"
                    disabled={disabled}
                    onClick={() => void act({ type: 'cast', commanderId: c.id })}
                  >
                    Record cast
                  </button>
                  <details>
                    <summary>Correct casts</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        void act({ type: 'castSet', commanderId: c.id, value: Number(form.get('casts')) });
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
                          defaultValue={c.casts}
                        />
                      </Field>
                      <button disabled={disabled}>Correct casts</button>
                    </form>
                  </details>
                </div>
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
            profile.rotations[playerId] ??
            facesAcross(profile.tableLayout, game.order.indexOf(playerId), game.order.length)
          }
          onChange={(flipped) =>
            void updateProfile({ rotations: { ...profile.rotations, [playerId]: flipped } })
          }
        >
          Face this seat across the table
        </Toggle>
        <p className="hint">Only changes the view on this device. Player sheets stay upright.</p>
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
  const [total, setTotal] = useState(String(value));
  return (
    <form
      className="damage-correction"
      onSubmit={(e) => {
        e.preventDefault();
        void act({ type: 'damageSet', playerId, commanderId, value: Number(total) });
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
