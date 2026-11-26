// Signed-in user, token and saved places.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type Place, type User } from '../api';
import { load, store } from './storage';

type Saved = { token: string | null; user: User | null };

type Ctx = Saved & {
  ready: boolean;
  places: Place[];
  signInGuest: (lang: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<string>;
  verifyOtp: (phone: string, code: string, lang: string) => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'avatar' | 'lang'>>) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  savePlace: (p: Omit<Place, 'id'>) => Promise<Place>;
  removePlace: (id: string) => Promise<void>;
  call: <T>(path: string, opts?: { method?: string; body?: unknown; signal?: AbortSignal }) => Promise<T>;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<Saved>({ token: null, user: null });
  const [places, setPlaces] = useState<Place[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    load<Saved>('session', { token: null, user: null }).then((v) => {
      setSaved(v);
      setReady(true);
    });
  }, []);

  const persist = useCallback((next: Saved) => {
    setSaved(next);
    store('session', next.token ? next : null);
  }, []);

  const call = useCallback(
    <T,>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}) =>
      api<T>(path, { ...opts, token: saved.token }),
    [saved.token],
  );

  // Refresh profile and places whenever we have a token.
  useEffect(() => {
    if (!saved.token) {
      setPlaces([]);
      return;
    }
    api<{ user: User }>('/me', { token: saved.token })
      .then((r) => persist({ token: saved.token, user: r.user }))
      .catch((e) => {
        if (e.status === 401) persist({ token: null, user: null });
      });
    api<{ places: Place[] }>('/places', { token: saved.token })
      .then((r) => setPlaces(r.places))
      .catch(() => {});
  }, [saved.token, persist]);

  const value = useMemo<Ctx>(
    () => ({
      ...saved,
      ready,
      places,
      call,
      signInGuest: async (lang) => {
        const r = await api<{ token: string; user: User }>('/auth/guest', { body: { lang } });
        persist(r);
      },
      requestOtp: async (phone) => {
        const r = await api<{ phone: string }>('/auth/otp/request', { body: { phone } });
        return r.phone;
      },
      verifyOtp: async (phone, code, lang) => {
        // Sending the guest token upgrades the guest account and keeps its places.
        const r = await api<{ token: string; user: User }>('/auth/otp/verify', { body: { phone, code, lang }, token: saved.token });
        persist(r);
      },
      updateProfile: async (patch) => {
        const r = await call<{ user: User }>('/me', { method: 'PATCH', body: patch });
        persist({ token: saved.token, user: r.user });
      },
      signOut: async () => persist({ token: null, user: null }),
      deleteAccount: async () => {
        await call('/me', { method: 'DELETE' });
        persist({ token: null, user: null });
      },
      savePlace: async (p) => {
        const r = await call<{ place: Place }>('/places', { body: p });
        setPlaces((prev) => [...prev.filter((x) => p.kind === 'favorite' || x.kind !== p.kind), r.place]);
        return r.place;
      },
      removePlace: async (id) => {
        await call('/places/' + id, { method: 'DELETE' });
        setPlaces((prev) => prev.filter((x) => x.id !== id));
      },
    }),
    [saved, ready, places, call, persist],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
