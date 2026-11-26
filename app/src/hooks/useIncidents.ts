// Incidents on screen: loaded for the visible map area and kept live over a socket.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Incident } from '../api';
import { SOCKET_URL } from '../config';
import { useSession } from '../state/session';

export function useIncidents() {
  const { token, call } = useSession();
  const [items, setItems] = useState<Record<string, Incident>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
    const upsert = (inc: Incident) => setItems((prev) => ({ ...prev, [inc.id]: inc }));
    socket.on('incident:new', upsert);
    socket.on('incident:update', upsert);
    socket.on('incident:removed', ({ id }: { id: string }) =>
      setItems((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      }),
    );
    return () => {
      socket.disconnect();
    };
  }, [token]);

  // Drop expired items locally too (in case a removal event was missed).
  useEffect(() => {
    const t = setInterval(() => {
      setItems((prev) => {
        const now = Date.now();
        const next: Record<string, Incident> = {};
        for (const [k, v] of Object.entries(prev)) if (v.expiresAt > now) next[k] = v;
        return next;
      });
    }, 30000);
    return () => clearInterval(t);
  }, []);

  /** Call when the map stops moving. bounds = [west, south, east, north]. */
  const loadArea = useCallback(
    (bounds: [number, number, number, number]) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const [w, s, e, n] = bounds;
        if (e - w > 5 || n - s > 5) return; // zoomed too far out
        try {
          const r = await call<{ incidents: Incident[] }>(`/incidents?bbox=${w},${s},${e},${n}`);
          setItems((prev) => {
            const next = { ...prev };
            for (const inc of r.incidents) next[inc.id] = inc;
            const keys = Object.keys(next);
            if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete next[k];
            return next;
          });
        } catch {
          // Offline: keep what we have.
        }
      }, 400);
    },
    [call],
  );

  const upsert = useCallback((inc: Incident) => setItems((prev) => ({ ...prev, [inc.id]: inc })), []);
  const remove = useCallback((id: string) => setItems((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  }), []);

  return { incidents: Object.values(items), loadArea, upsert, remove };
}
