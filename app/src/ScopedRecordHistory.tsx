import { useEffect, useRef, useState } from 'react';
import { api, rural, type ActivityPage } from './api';
import RecordHistory from './RecordHistory';

// Module forms fetch the audit only when the producer opens it.
export default function ScopedRecordHistory({ farmId, entity, recordId, timezone, busy, online }: {
  farmId: string; entity: string; recordId: string; timezone: string; busy: boolean; online: boolean;
}) {
  const [data, setData] = useState<ActivityPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function load(append = false) {
    if (pending.current || !online) return;
    pending.current = true; setLoading(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try {
      const page = await api<ActivityPage>(rural(farmId, `/${entity}/${recordId}/history?offset=${append ? data?.items.length || 0 : 0}`), { signal: controller.signal });
      if (!controller.signal.aborted) setData(previous => append && previous ? { items: [...previous.items, ...page.items], has_more: page.has_more } : page);
    } catch { if (!controller.signal.aborted) setError('Não foi possível consultar as alterações. Feche e abra o histórico para tentar novamente.'); }
    finally { pending.current = false; if (!controller.signal.aborted) setLoading(false); }
  }
  return <RecordHistory data={data} error={error || (!online && !data ? 'Conecte-se para consultar as alterações.' : '')} timezone={timezone} disabled={busy || loading || !online} onOpen={() => { if (!data || error) void load(); }} onMore={() => void load(true)}/>;
}
