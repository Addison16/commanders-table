import { useState } from 'react';
import { defaultSetup, setupFromGame } from '../../shared/game.js';
import { palettes, setupSchema, type Setup } from '../../shared/schema.js';
import { useApp, report, startLocal, updateProfile } from '../app/store.js';
import { Field, Icon, Sheet, Toggle } from '../components/ui.js';
export function SetupSheet({ mode, onClose }: { mode: 'local' | 'room'; onClose: () => void }) {
  const [setup, setSetup] = useState<Setup>(() => {
    const { confirmed, profile } = useApp.getState();
    return confirmed ? setupFromGame(confirmed) : (profile.setup ?? defaultSetup());
  });
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState(useApp.getState().profile.displayName || 'Host');
  const settings = setup.settings;
  const change = (patch: Partial<Setup['settings']>) =>
    setSetup((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const count = (n: number) =>
    setSetup((s) => ({
      ...s,
      seats: Array.from({ length: n }, (_, i) => s.seats[i] ?? defaultSetup(8).seats[i]),
    }));
  const preset = (value: Setup['settings']['preset']) =>
    change({
      preset: value,
      ...(value === 'Custom'
        ? {}
        : { startingLife: value === 'Commander' ? 40 : 20, commander: value === 'Commander' }),
    });
  const submit = async () => {
    setBusy(true);
    try {
      const data = setupSchema.parse(setup);
      if (mode === 'local') await startLocal(data);
      else {
        const { createRoom } = await import('../adapters/room.js');
        await createRoom(data, displayName);
      }
      await updateProfile({ setup: data, displayName });
      onClose();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={mode === 'local' ? 'Set your table' : 'Create a shared room'}
      description={
        mode === 'local'
          ? 'One device. Everyone around the table.'
          : 'Choose the table size. Friends set their own names and commanders when they join.'
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="section-label">
          PLAYERS <span>1 is practice mode</span>
        </div>
        <div className="seat-count">
          {Array.from({ length: 8 }, (_, i) => (
            <button
              key={i}
              type="button"
              className={setup.seats.length === i + 1 ? 'selected' : ''}
              aria-pressed={setup.seats.length === i + 1}
              onClick={() => count(i + 1)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <Field label="Game preset">
          <select
            value={settings.preset}
            onChange={(e) => preset(e.target.value as Setup['settings']['preset'])}
          >
            <option>Commander</option>
            <option>20-life game</option>
            <option>Custom</option>
          </select>
        </Field>
        <Field label="Starting life">
          <input
            type="number"
            inputMode="numeric"
            min={-999999}
            max={999999}
            required
            value={settings.startingLife}
            onChange={(e) => change({ startingLife: e.target.valueAsNumber })}
          />
        </Field>
        {mode === 'room' && (
          <Field label="Your display name">
            <input
              required
              maxLength={40}
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
        )}
        <details>
          <summary>
            Names, colors & commanders <span>Optional</span>
          </summary>
          <div className="seat-forms">
            {setup.seats.map((seat, i) => (
              <div className="seat-form" key={i}>
                <span className={`palette-dot ${seat.color}`} />
                <Field label={`Seat ${i + 1} name`}>
                  <input
                    value={seat.name}
                    maxLength={40}
                    required
                    onChange={(e) =>
                      setSetup((s) => ({
                        ...s,
                        seats: s.seats.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)),
                      }))
                    }
                  />
                </Field>
                <Field label="Color">
                  <select
                    value={seat.color}
                    onChange={(e) =>
                      setSetup((s) => ({
                        ...s,
                        seats: s.seats.map((p, j) =>
                          j === i ? { ...p, color: e.target.value as typeof seat.color } : p,
                        ),
                      }))
                    }
                  >
                    {palettes.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                {settings.commander && (
                  <>
                    <Field label="Commanders">
                      <select
                        value={seat.commanders.length}
                        onChange={(e) =>
                          setSetup((s) => ({
                            ...s,
                            seats: s.seats.map((p, j) =>
                              j === i
                                ? {
                                    ...p,
                                    commanders:
                                      Number(e.target.value) === 2
                                        ? [p.commanders[0], 'Commander 2']
                                        : [p.commanders[0]],
                                  }
                                : p,
                            ),
                          }))
                        }
                      >
                        <option value="1">One commander</option>
                        <option value="2">Two commanders / partners</option>
                      </select>
                    </Field>
                    {seat.commanders.map((label, k) => (
                      <Field key={k} label={`Commander ${k + 1}`}>
                        <input
                          value={label}
                          maxLength={40}
                          required
                          onChange={(e) =>
                            setSetup((s) => ({
                              ...s,
                              seats: s.seats.map((p, j) =>
                                j === i
                                  ? {
                                      ...p,
                                      commanders: p.commanders.map((n, nI) =>
                                        nI === k ? e.target.value : n,
                                      ),
                                    }
                                  : p,
                              ),
                            }))
                          }
                        />
                      </Field>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
        <details>
          <summary>
            Trackers & house rules <span>Advanced</span>
          </summary>
          <Toggle checked={settings.poison} onChange={(poison) => change({ poison })}>
            Poison tracker
          </Toggle>
          <Toggle checked={settings.commander} onChange={(commander) => change({ commander })}>
            Commander tools
          </Toggle>
          <Field label="Poison warning threshold">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="999999"
              value={settings.poisonThreshold}
              onChange={(e) => change({ poisonThreshold: e.target.valueAsNumber })}
            />
          </Field>
          <Field label="Commander damage warning threshold">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="999999"
              value={settings.commanderThreshold}
              onChange={(e) => change({ commanderThreshold: e.target.valueAsNumber })}
            />
          </Field>
          <p className="hint">
            These are manual trackers. Presets do not enforce deck legality or decide game outcomes.
          </p>
        </details>
        <div className="sheet-footer">
          <button className="primary full" disabled={busy}>
            <Icon name="spark" />
            {busy ? 'Preparing your table…' : mode === 'local' ? 'Let’s play' : 'Create room'}
          </button>
          <p className="hint center">Your previous local game is saved in Recent games.</p>
        </div>
      </form>
    </Sheet>
  );
}
