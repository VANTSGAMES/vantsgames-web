import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useApi<T = any>(path: string | null, opts: { auth?: boolean; enabled?: boolean; refetchMs?: number } = {}) {
  return useQuery<T, any>({
    queryKey: [path, !!opts.auth],
    queryFn: () => api<T>(path as string, { auth: opts.auth }),
    enabled: !!path && opts.enabled !== false,
    refetchInterval: opts.refetchMs,
    staleTime: 30_000,
    retry: (n, e: any) => n < 1 && !(e && e.status >= 400 && e.status < 500),
  });
}
