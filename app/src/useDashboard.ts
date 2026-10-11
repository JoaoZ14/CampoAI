import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, rural, type DashboardData, type DashboardFilter } from './api';

export function useDashboard(farmId: string, filter: DashboardFilter) {
  const query = new URLSearchParams({ period: filter.period });
  if (filter.period === 'custom') { query.set('from', filter.from!); query.set('to', filter.to!); }
  const search = query.toString(), key = `${farmId}:${search}`;
  const [state, setState] = useState<{ key: string; data: DashboardData | null }>({ key: '', data: null });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const selected = useRef(key); selected.current = key;
  const controller = useRef<AbortController | null>(null);
  const lastRefresh = useRef(0), refreshing = useRef(false);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    if (!farmId) { setState({ key, data: null }); setPending(false); setFailure(null); refreshing.current = false; return; }
    setPending(true); setFailure(null); lastRefresh.current = Date.now(); refreshing.current = true;
    try {
      const data = await api<DashboardData>(rural(farmId, `/dashboard?${search}`), { signal: current.signal });
      if (!current.signal.aborted && selected.current === key) setState({ key, data });
    } catch (cause) {
      if (!current.signal.aborted && selected.current === key) setFailure({ key, message: errorMessage(cause) });
    } finally {
      if (!current.signal.aborted && selected.current === key) { setPending(false); refreshing.current = false; }
    }
  }, [farmId, key, search]);
  useEffect(() => { void refresh(); return () => controller.current?.abort(); }, [refresh]);
  useEffect(() => {
    const resume = () => { if (farmId && document.visibilityState === 'visible' && navigator.onLine && !refreshing.current && Date.now() - lastRefresh.current >= 10000) void refresh(); };
    window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
    return () => { window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [farmId, refresh]);
  const error = failure?.key === key ? failure.message : undefined;
  return { data: state.key === key ? state.data : null, loading: Boolean(farmId) && (pending || (state.key !== key && !error)), error, refresh };
}
