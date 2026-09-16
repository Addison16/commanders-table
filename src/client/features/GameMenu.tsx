import { useEffect, useState } from 'react';
import { defaultSetup } from '../../shared/game.js';
import { type Game } from '../../shared/schema.js';
import {
  act,
  isHost,
  useApp,
  repository,
  report,
  startLocal,
  resumeLocal,
  takeOver,
  openHome,
} from '../app/store.js';
import { gameExport, parseImport } from '../storage/repository.js';
import { ask, downloadText, Icon, Sheet } from '../components/ui.js';
export function HistorySheet({ onClose }: { onClose: () => void }) {
  const game = useApp((s) => s.game)!,
    mode = useApp((s) => s.mode);
  return (
    <Sheet
      title="The story so far"
      description="The latest 200 game actions. Dice live in Utilities."
      onClose={onClose}
    >
      {mode === 'local' && (
        <button
          className="secondary full"
          disabled={!game.redo.length || useApp.getState().readOnly}
          onClick={() => void act({ type: 'redo' })}
        >
          Redo last undone action
        </button>
      )}
      {game.history.length ? (
        <ol className="history-list">
          {[...game.history].reverse().map((entry) => (
            <li key={entry.id}>
              <span className="history-dot" />
              <div>
                <p>{entry.summary}</p>
                <small>
                  {entry.actor} ·{' '}
                  {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </small>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state">
          <Icon name="history" size={36} />
          <p>A fresh beginning.</p>
          <span>Your game actions will appear here.</span>
        </div>
      )}
    </Sheet>
  );
}
export function GameMenu({ onClose, open }: { onClose: () => void; open: (sheet: string) => void }) {
  const game = useApp((s) => s.confirmed)!,
    state = useApp();
  const [archive, setArchive] = useState<Game[]>([]);
  const [importText, setImportText] = useState('');
  useEffect(() => {
    void repository.archive().then(setArchive).catch(report);
  }, []);
  const load = async (text: string) => {
    try {
      const imported = parseImport(text);
      if (
        await ask(
          'Import a local game?',
          'The current local game is archived. A shared room, if open, stays unchanged. This backup grants no room permissions.',
        )
      ) {
        await startLocal(defaultSetup(), imported);
        onClose();
      }
    } catch (e) {
      report(e);
    }
  };
  const available = !state.readOnly && (state.mode === 'local' || state.connected);
  return (
    <Sheet
      title="Around the table"
      description={
        state.mode === 'local' ? 'One device · saved in this browser' : 'Shared room · saved on your server'
      }
      onClose={onClose}
    >
      <div className="menu-list">
        <button onClick={() => open('layout')}>
          <Icon name="phone" />
          <span>Table layout</span>
          <Icon name="arrow" />
        </button>
        <button onClick={() => open('history')}>
          <Icon name="history" />
          <span>Game history</span>
          <Icon name="arrow" />
        </button>
        <button onClick={() => open('settings')}>
          <Icon name="settings" />
          <span>Display & preferences</span>
          <Icon name="arrow" />
        </button>
        {state.mode === 'room' && (
          <button onClick={() => open('room')}>
            <Icon name="people" />
            <span>Room & players</span>
            <Icon name="arrow" />
          </button>
        )}
        <button
          onClick={() => downloadText(gameExport(game), `commanders-table-${game.id.slice(0, 8)}.json`)}
        >
          <Icon name="download" />
          <span>Export game backup</span>
          <Icon name="arrow" />
        </button>
        <button
          disabled={!available || !isHost()}
          onClick={async () => {
            if (
              await ask(
                'Start a rematch?',
                'Save the final game and reset life, counters, damage, turns, timer and dice. Names, commander labels and seats stay.',
              )
            ) {
              await act({ type: 'rematch' });
              onClose();
            }
          }}
        >
          <Icon name="rotate" />
          <span>Rematch · same seats</span>
          <Icon name="arrow" />
        </button>
        <button onClick={() => open('new-game')}>
          <Icon name="plus" />
          <span>New game · change setup</span>
          <Icon name="arrow" />
        </button>
      </div>
      {state.readOnly && (
        <button className="primary full" onClick={() => void takeOver().catch(report)}>
          Take over editing in this tab
        </button>
      )}
      {state.mode === 'room' && (
        <>
          <button
            className="secondary full"
            onClick={async () => {
              if (
                await ask(
                  'Continue an independent copy?',
                  'Create a new local game from the last confirmed room state. Future changes will never merge back into the room.',
                )
              ) {
                await startLocal(defaultSetup(), game);
                onClose();
              }
            }}
          >
            Continue a copy on this device
          </button>
          <button
            className="text-button full"
            onClick={() => {
              void resumeLocal().catch(report);
              onClose();
            }}
          >
            Open my saved local game
          </button>
        </>
      )}
      <details>
        <summary>Import a game backup</summary>
        <p className="hint">Choose an exported JSON file, or paste its contents below.</p>
        <label className="file-label">
          Choose JSON backup
          <input
            aria-label="Choose JSON backup"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size <= 2_000_000) void f.text().then(load).catch(report);
              else if (f) report(new Error('Maximum backup size is 2 MB'));
            }}
          />
        </label>
        <textarea
          aria-label="Paste backup JSON"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste game JSON"
        />
        <button className="secondary full" disabled={!importText} onClick={() => void load(importText)}>
          Validate & import
        </button>
      </details>
      <details>
        <summary>
          Recent local games <span>{archive.length} / 10</span>
        </summary>
        {archive.length ? (
          archive.map((g) => (
            <div className="archive-item" key={g.id}>
              <div>
                <strong>
                  {g.settings.preset} · {g.order.length} players
                </strong>
                <small>
                  {new Date(g.timer.startedAt).toLocaleDateString()} ·{' '}
                  {g.order.map((id) => g.players[id].name).join(', ')}
                </small>
              </div>
              <button
                onClick={async () => {
                  try {
                    if (g.status === 'active') await resumeLocal(g.id);
                    else if (await ask('Open a copy?', 'Your current local game is saved first.'))
                      await startLocal(defaultSetup(), g);
                    else return;
                    onClose();
                  } catch (e) {
                    report(e);
                  }
                }}
              >
                {g.status === 'active' ? 'Resume' : 'Open copy'}
              </button>
              <button
                aria-label={`Delete game ${g.id.slice(0, 8)}`}
                onClick={async () => {
                  if (await ask('Delete this archived game?', 'This removes only this saved snapshot.')) {
                    await repository.deleteArchive(g.id);
                    setArchive(await repository.archive());
                  }
                }}
              >
                <Icon name="close" />
              </button>
            </div>
          ))
        ) : (
          <p className="hint">Previous games appear here when you start a new game or rematch.</p>
        )}
      </details>
      {game.status === 'active' && (
        <button
          className="danger full"
          disabled={!available || !isHost()}
          onClick={async () => {
            if (
              await ask(
                'End this game?',
                'Return to the starting options. Your totals and history will be kept in Recently ended for 24 hours, so you can reopen an accidental ending.',
              )
            ) {
              await act({ type: 'end' });
              onClose();
            }
          }}
        >
          End game
        </button>
      )}
      <button
        className="text-button full"
        onClick={() => {
          void openHome().catch(report);
          onClose();
        }}
      >
        Back to home
      </button>
    </Sheet>
  );
}
