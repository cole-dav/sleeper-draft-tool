import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { getSleeperUser } from "@/lib/sleeperUser";
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
        let msg = "Failed to sync league data";
        try {
          const data = await res.json();
          if (data?.message) msg = data.message;
        } catch {}
        if (res.status === 404) throw new Error("League not found on Sleeper");
        throw new Error(msg);
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
      const user = getSleeperUser();
      const userHeader = user?.userId ? { "X-Sleeper-User-Id": user.userId } : {};
      const res = await fetch(url, { credentials: "include", headers: userHeader });
      
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

// GET /api/sleeper/user/:userId/leagues - List user's leagues (current + previous season by default)
export function useUserLeagues(userId: string | null, seasons?: string[]) {
  return useQuery({
    queryKey: [api.user.leagues.path, userId, seasons?.join(",") ?? ""],
    queryFn: async () => {
      if (!userId) return [];
      const params = seasons?.length ? `?seasons=${encodeURIComponent(seasons.join(","))}` : "";
      const url = buildUrl(api.user.leagues.path, { userId }) + params;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leagues");
      return api.user.leagues.responses[200].parse(await res.json());
    },
    enabled: !!userId,
  });
}

// PUT /api/league/:id/team-order - Save draft board column order (sticky)
export function useUpdateLeagueTeamOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leagueId, order }: { leagueId: string; order: number[] }) => {
      const url = buildUrl(api.league.teamOrder.path, { id: leagueId });
      const res = await fetch(url, {
        method: api.league.teamOrder.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(api.league.teamOrder.input.parse({ order })),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save team order");
      return api.league.teamOrder.responses[200].parse(await res.json());
    },
    onSuccess: (_, { leagueId }) => {
      queryClient.invalidateQueries({ queryKey: [api.league.get.path, leagueId] });
    },
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

// POST /api/picks/:id/prediction - Save per-user prediction
export function useSavePickPrediction(leagueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comment }: { id: number; comment: string }) => {
      const url = buildUrl(api.picks.prediction.path, { id });
      const user = getSleeperUser();
      const userHeader = user?.userId ? { "X-Sleeper-User-Id": user.userId } : {};
      const res = await fetch(url, {
        method: api.picks.prediction.method,
        headers: { "Content-Type": "application/json", ...userHeader },
        body: JSON.stringify(api.picks.prediction.input.parse({ comment })),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save prediction");
      return api.picks.prediction.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.league.get.path, leagueId] });
    },
  });
}
