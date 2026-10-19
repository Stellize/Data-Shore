import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

export function useFetch(url, { pollMs = 0, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled && url));
  const [tick, setTick] = useState(0);
  const hasData = useRef(false);
  const lastUrl = useRef(url);

  useEffect(() => {
    if (lastUrl.current !== url) {
      lastUrl.current = url;
      hasData.current = false;
      setData(null);
      setError(null);
      if (enabled && url) setLoading(true);
    }
    if (!enabled || !url) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let mounted = true;
    let timer = null;

    const load = async (initial) => {
      if (initial && !hasData.current) setLoading(true);
      try {
        const result = await api(url, { signal: controller.signal });
        if (!mounted) return;
        hasData.current = true;
        setData(result);
        setError(null);
      } catch (err) {
        if (err.name === 'AbortError' || !mounted) return;
        setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load(true);
    if (pollMs > 0) timer = window.setInterval(() => load(false), pollMs);

    return () => {
      mounted = false;
      controller.abort();
      if (timer) window.clearInterval(timer);
    };
  }, [url, pollMs, enabled, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, loading, reload, setData };
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useDocumentTitle(title) {
  useEffect(() => {
    const base = 'Data Shore';
    document.title = title ? `${title} · ${base}` : `${base} — a read-only shore for your drives`;
  }, [title]);
}

export function useLockBody(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}
