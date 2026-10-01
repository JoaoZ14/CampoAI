import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, rural, type ActivityPage, type Summary, type Task, type Weather } from './api';

type Data = { farmId: string; summary: Summary | null; activity: ActivityPage; tasks: Task[]; weather: Weather | null };
const empty = (farmId: string): Data => ({ farmId, summary: null, activity: { items: [], has_more: false }, tasks: [], weather: null });

export function useFarmData(farmId: string) {
  const [data, setData] = useState<Data>(() => empty(''));
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const controller = useRef<AbortController | null>(null);
  const selected = useRef(farmId);
  selected.current = farmId;
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    if (!farmId) { setData(empty('')); setErrors({}); setPending(false); return; }
    setPending(true); setErrors({});
    const options = { signal: current.signal };
    const results = await Promise.allSettled([
      api<Summary>(rural(farmId, '/summary'), options),
      api<ActivityPage>(rural(farmId, '/activity'), options),
      api<Task[]>(rural(farmId, '/farm_tasks?status=pending'), options),
      api<Weather>(rural(farmId, '/weather'), options),
    ]);
    if (current.signal.aborted || selected.current !== farmId) return;
    const [summary, activity, tasks, weather] = results;
    setData(previous => ({
      farmId,
      summary: summary.status === 'fulfilled' ? summary.value : previous.farmId === farmId ? previous.summary : null,
      activity: activity.status === 'fulfilled' ? activity.value : previous.farmId === farmId ? previous.activity : empty(farmId).activity,
      tasks: tasks.status === 'fulfilled' ? tasks.value : previous.farmId === farmId ? previous.tasks : [],
      weather: weather.status === 'fulfilled' ? weather.value : null,
    }));
    const failures: Record<string, string> = {};
    results.forEach((result, index) => {
      // No forecast is expected until location is registered or the feature enabled.
      if (result.status === 'rejected' && !(index === 3 && [400, 404].includes(result.reason?.status)))
        failures[['summary', 'activity', 'tasks', 'weather'][index]] = errorMessage(result.reason);
    });
    setErrors(failures); setPending(false);
  }, [farmId]);
  useEffect(() => { void refresh(); return () => controller.current?.abort(); }, [refresh]);
  const current = data.farmId === farmId ? data : empty(farmId);
  return { ...current, loading: Boolean(farmId) && (pending || data.farmId !== farmId), errors, refresh,
    appendActivity: (page: ActivityPage) => setData(previous => previous.farmId === farmId ? { ...previous, activity: { items: [...previous.activity.items, ...page.items], has_more: page.has_more } } : previous),
    appendTasks: (page: Task[]) => setData(previous => previous.farmId === farmId ? { ...previous, tasks: [...previous.tasks, ...page] } : previous),
  };
}
