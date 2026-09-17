import { useEffect, useId, useRef, useState } from 'react';
import { commanderCardSchema, type CommanderCard } from '../../shared/cards.js';

const looksLikeLink = (value: string) => /^(?:https?:\/\/|(?:www\.)?scryfall\.com\/)/i.test(value.trim());

async function requestCards(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/cards/${path}`, {
    signal,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body?.error === 'string'
        ? body.error
        : response.status === 429
          ? 'Artwork searches are busy. Try again in a moment.'
          : 'Artwork search is unavailable right now.';
    throw new Error(message);
  }
  return body;
}

export function CommanderInput({
  label,
  value,
  card,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  card?: CommanderCard | null;
  onChange: (name: string, card: CommanderCard | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, disabled, onChange });
  latest.current = { value, disabled, onChange };
  const lookup = useRef<AbortController | null>(null);
  const lookupSequence = useRef(0);
  const suggestionRequest = useRef<AbortController | null>(null);
  const suggestionSequence = useRef(0);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failedImage, setFailedImage] = useState('');
  useEffect(() => {
    const retry = () => setFailedImage('');
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);
  const [suggestions, setSuggestions] = useState<{ query: string; names: string[] }>();
  const query = value.trim();
  const names = focused && suggestions?.query === query && !card ? suggestions.names : [];

  useEffect(() => {
    const form = input.current?.form;
    const cancelRequests = () => {
      lookup.current?.abort();
      ++lookupSequence.current;
      suggestionRequest.current?.abort();
      ++suggestionSequence.current;
    };
    const cancelPending = () => {
      cancelRequests();
      setBusy(false);
      setError('');
      setSuggestions(undefined);
      setFocused(false);
    };
    // Saving a manual name must not let a late result replace it afterward.
    form?.addEventListener('submit', cancelPending, true);
    return () => {
      form?.removeEventListener('submit', cancelPending, true);
      cancelRequests();
    };
  }, []);

  useEffect(() => {
    // A live update from another player also invalidates a lookup, even if
    // this field's own input handler did not run.
    lookup.current?.abort();
    ++lookupSequence.current;
    suggestionRequest.current?.abort();
    ++suggestionSequence.current;
    setBusy(false);
    setError('');
    input.current?.setCustomValidity(
      looksLikeLink(value) ? 'Choose Find artwork to use this card link.' : '',
    );
  }, [value, card?.id, card?.imageUrl, disabled]);

  useEffect(() => {
    suggestionRequest.current?.abort();
    const sequence = ++suggestionSequence.current;
    if (!focused || disabled || busy || card || query.length < 2 || looksLikeLink(query)) return;
    const controller = new AbortController();
    suggestionRequest.current = controller;
    const timer = setTimeout(() => {
      void requestCards(`suggest?${new URLSearchParams({ q: query })}`, controller.signal)
        .then((body) => {
          if (
            controller.signal.aborted ||
            sequence !== suggestionSequence.current ||
            latest.current.value.trim() !== query
          )
            return;
          const result = body as { names?: unknown } | null;
          const names = Array.isArray(result?.names)
            ? result.names.filter((name): name is string => typeof name === 'string' && name.length <= 100)
            : [];
          setSuggestions({ query, names: names.slice(0, 20) });
        })
        .catch(() => {
          // A manual name remains usable when the artwork service is offline.
          if (!controller.signal.aborted && sequence === suggestionSequence.current)
            setSuggestions({ query, names: [] });
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, focused, disabled, busy, card]);

  async function findArtwork(name: string) {
    if (disabled || !name.trim()) return;
    lookup.current?.abort();
    suggestionRequest.current?.abort();
    ++suggestionSequence.current;
    const controller = new AbortController();
    lookup.current = controller;
    const sequence = ++lookupSequence.current;
    const previousValue = value;
    setBusy(true);
    setError('');
    setSuggestions(undefined);
    try {
      const body = (await requestCards(
        `resolve?${new URLSearchParams({ q: name.trim() })}`,
        controller.signal,
      )) as { card?: unknown } | null;
      if (
        controller.signal.aborted ||
        sequence !== lookupSequence.current ||
        latest.current.value !== previousValue ||
        latest.current.disabled
      )
        return;
      const resolved = commanderCardSchema.safeParse(body?.card);
      if (!resolved.success) throw new Error('No usable artwork was found for this name.');
      latest.current.onChange(resolved.data.name, resolved.data);
      setFocused(false);
      input.current?.focus({ preventScroll: true });
    } catch (reason) {
      if (
        !controller.signal.aborted &&
        sequence === lookupSequence.current &&
        latest.current.value === previousValue
      )
        setError(
          `${reason instanceof Error ? reason.message : 'Artwork search is unavailable right now.'} You can keep a commander name and play without artwork.`,
        );
    } finally {
      if (sequence === lookupSequence.current) setBusy(false);
    }
  }

  function cancelLookup() {
    lookup.current?.abort();
    ++lookupSequence.current;
    suggestionRequest.current?.abort();
    ++suggestionSequence.current;
    setBusy(false);
    setError('');
    setSuggestions(undefined);
  }

  return (
    <div
      className="commander-input"
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && names.length) {
          event.preventDefault();
          event.stopPropagation();
          setFocused(false);
        }
      }}
    >
      <label className="field" htmlFor={id}>
        <span>{label}</span>
        <input
          ref={input}
          id={id}
          value={value}
          disabled={disabled}
          maxLength={512}
          autoComplete="off"
          spellCheck={false}
          placeholder="Commander name or Scryfall card link"
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          onChange={(event) => {
            cancelLookup();
            setFocused(true);
            const next = event.target.value;
            onChange(looksLikeLink(next) ? next : next.slice(0, 100), null);
          }}
        />
      </label>
      {names.length > 0 && (
        <ul className="commander-suggestions" aria-label={`${label} suggestions`}>
          {names.map((name) => (
            <li key={name}>
              <button type="button" disabled={disabled || busy} onClick={() => void findArtwork(name)}>
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="commander-art-actions">
        <button
          className="secondary"
          type="button"
          disabled={disabled || busy || !query}
          onClick={() => void findArtwork(value)}
        >
          {busy ? 'Finding artwork…' : 'Find artwork'}
        </button>
        <small id={`${id}-hint`}>Optional. A name alone works too.</small>
      </div>
      {error && (
        <p id={`${id}-error`} className="commander-art-error" role="status">
          {error}
        </p>
      )}
      {card && (
        <div className="commander-art-preview">
          {failedImage === card.imageUrl ? (
            <span className="commander-art-unavailable">Artwork unavailable</span>
          ) : (
            <img
              src={card.imageUrl}
              alt={`${card.name} artwork`}
              loading="lazy"
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={() => setFailedImage(card.imageUrl)}
            />
          )}
          <div className="commander-art-credit">
            <strong>{card.name}</strong>
            <span>Art by {card.artist}</span>
            <span>© Wizards of the Coast</span>
            <a href={card.scryfallUrl} target="_blank" rel="noopener noreferrer">
              View on Scryfall
            </a>
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => {
                cancelLookup();
                setFocused(false);
                onChange(value, null);
              }}
            >
              Remove artwork
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
