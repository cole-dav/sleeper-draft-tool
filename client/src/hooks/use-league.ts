import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { LeagueDataResponse, DraftPick, UpdateDraftPick } from "@shared/schema";

// POST /api/league/:id/fetch - Trigger Sleeper sync
export function useFetchLeague() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (leagueId: string) => {
      const url = buildUrl(api.league.fetch.path, { id: leagueId });
      const res = await fetch(url, {
        method: api.league.fetch.method,
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 404) throw new Error("League not found on Sleeper");
        throw new Error("Failed to sync league data");
      }
      
      return api.league.fetch.responses[200].parse(await res.json());
    },
    onSuccess: (_, leagueId) => {
      // Invalidate the get query so data refreshes immediately
      queryClient.invalidateQueries({ queryKey: [api.league.get.path, leagueId] });
    }
  });
}

// GET /api/league/:id - Get full dashboard data
export function useLeague(id: string) {
  return useQuery<LeagueDataResponse>({
    queryKey: [api.league.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.league.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      
      if (!res.ok) {
        if (res.status === 404) throw new Error("League not found in database");
        throw new Error("Failed to fetch league data");
      }
      
      // The response is complex, cast it for now or rely on generic type if schema matches exactly
      return await res.json() as LeagueDataResponse;
    },
    enabled: !!id, // Only fetch if ID is present
  });
}

// PATCH /api/picks/:id - Update pick slot manually
export function useUpdatePick() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateDraftPick) => {
      const validated = api.picks.update.input.parse(updates);
      const url = buildUrl(api.picks.update.path, { id });
      
      const res = await fetch(url, {
        method: api.picks.update.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to update pick");
      return await res.json();
    },
    onSuccess: () => {
      // We don't have the league ID here easily without passing it, 
      // so we might want to invalidate all league queries or just update cache optimistically.
      // For safety, let's invalidate all league gets.
      queryClient.invalidateQueries({ queryKey: [api.league.get.path] });
    }
  });
}
