import { describe, expect, it } from 'vitest';
import { createGame, defaultSetup } from '../src/shared/game.js';
import { newId } from '../src/shared/random.js';
import { createRecap, recapDuration } from '../src/client/features/gameRecap.js';

describe('game recap snapshots', () => {
  it('preserves seat order, partner commanders and negative final totals without guessing a winner', () => {
    const setup = defaultSetup(3);
    setup.seats[0].commanders = ['Tymna the Weaver', 'Thrasios, Triton Hero'];
    const game = createGame(setup, newId, 1_000);
    game.status = 'ended';
    game.endedAt = 181_000;
    game.timer.pausedAt = 181_000;
    game.players[game.order[0]].life = -5;
    game.players[game.order[1]].life = 100;
    game.players[game.order[1]].eliminated = true;
    const before = structuredClone(game);
    const recap = createRecap(game, 999_999);
    expect(recap.final).toBe(true);
    expect(recap.at).toBe(181_000);
    expect(recap.duration).toBe('3m 0s');
    expect(recap.players.map((player) => player.id)).toEqual(game.order);
    expect(recap.players[0].commanders).toEqual(setup.seats[0].commanders);
    expect(recap.players.map((player) => player.life)).toEqual([-5, 100, 40]);
    expect(recap.players.every((player) => !player.winner)).toBe(true);
    expect(recap.result).toBe('');
    // An alternate win can happen at any life total; only an explicit choice wins.
    const winner = createRecap(game, 999_999, game.order[0]);
    expect(winner.result).toBe('Player 1 wins');
    expect(winner.players.map((player) => player.winner)).toEqual([true, false, false]);
    expect(createRecap(game, 999_999, 'draw').result).toBe('Draw');
    expect(createRecap(game, 999_999, newId()).result).toBe('');
    winner.players[0].name = 'Export-only edit';
    winner.players[0].commanders.push('Export-only commander');
    expect(game).toEqual(before);
  });

  it('excludes paused time and freezes ended and legacy game durations when exported later', () => {
    const game = createGame(defaultSetup(), newId, 1_000);
    game.timer.pausedMs = 60_000;
    expect(createRecap(game, 181_000).duration).toBe('2m 0s');
    game.timer.pausedAt = 121_000;
    expect(createRecap(game, 999_999).duration).toBe('1m 0s');
    game.status = 'ended';
    game.endedAt = 181_000;
    expect(createRecap(game, 999_999).duration).toBe('1m 0s');
    game.endedAt = null;
    expect(createRecap(game, 999_999).at).toBe(121_000);
    expect(createRecap(game, 999_999).duration).toBe('1m 0s');
  });

  it('labels an active snapshot clearly and does not let it announce a winner', () => {
    const game = createGame(defaultSetup(), newId, 1_000);
    const recap = createRecap(game, 2_500, game.order[0]);
    expect(recap.final).toBe(false);
    expect(recap.at).toBe(2_500);
    expect(recap.duration).toBe('1s');
    expect(recap.result).toBe('');
    expect(recap.players.every((player) => !player.winner)).toBe(true);
    expect(createRecap(game, 2_500, 'draw').result).toBe('');
    game.settings.commander = false;
    expect(createRecap(game, 2_500).players.every((player) => !player.commanders.length)).toBe(true);
  });

  it.each([
    [0, '0s'],
    [-1, '0s'],
    [59_999, '59s'],
    [60_000, '1m 0s'],
    [3_661_000, '1h 1m'],
    [90_000_000, '25h 0m'],
  ])('formats %i milliseconds as %s', (milliseconds, expected) => {
    expect(recapDuration(milliseconds)).toBe(expected);
  });
});
