import type { Handler } from "@netlify/functions";
import { storage } from "../../server/storage";
import { api } from "../../shared/routes";
import type { InsertDraftPick } from "../../shared/schema";
import { z } from "zod";

function calculateTeamNeeds(_roster: any, _allRosters: any[]) {
  const positions = ["QB", "RB", "WR", "TE"];
  return positions
    .map((pos) => ({ position: pos, score: Math.floor(Math.random() * 100) }))
    .sort((a, b) => b.score - a.score);
}

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const handler: Handler = async (event) => {
  const path = event.rawUrl ? new URL(event.rawUrl).pathname : event.path;
  const pathMatch = path.match(/^\/api\/league\/([^/]+)\/fetch$/);
  const getMatch = path.match(/^\/api\/league\/([^/]+)$/);
  const teamOrderMatch = path.match(/^\/api\/league\/([^/]+)\/team-order$/);
  const pickMatch = path.match(/^\/api\/picks\/(\d+)$/);

  try {
    if (event.httpMethod === "POST" && pathMatch) {
      const leagueId = pathMatch[1];
      const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
      if (!leagueRes.ok) throw new Error("League not found");
      const leagueData = await leagueRes.json();

      await storage.upsertLeague({
        leagueId: String(leagueData.league_id),
        name: leagueData.name || "Unknown League",
        totalRosters: leagueData.total_rosters ?? 12,
        season: String(leagueData.season || new Date().getFullYear()),
        avatar: leagueData.avatar ?? null,
        settings: leagueData.settings ?? {},
      });

      const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
      const usersData = await usersRes.json();
      const usersList = (Array.isArray(usersData) ? usersData : []).map((u: any) => ({
        userId: String(u.user_id),
        leagueId: leagueId,
        displayName: String(u.display_name ?? "Unknown"),
        avatar: u.avatar ?? null,
      }));
      await storage.upsertUsers(usersList);

      const rostersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
      const rostersData = await rostersRes.json();
      const rostersList = (Array.isArray(rostersData) ? rostersData : []).map((r: any) => ({
        leagueId: leagueId,
        rosterId: r.roster_id,
        ownerId: r.owner_id ?? null,
        settings: r.settings ?? null,
      }));
      await storage.upsertRosters(rostersList);

      const tradedRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`);
      const tradedPicksRaw = await tradedRes.json();
      const tradedPicks = Array.isArray(tradedPicksRaw) ? tradedPicksRaw : [];

      await storage.clearPicks(leagueId);

      const currentSeason = parseInt(String(leagueData.season), 10) || new Date().getFullYear();
      const rounds = leagueData.settings?.draft_rounds ?? 3;
      const numTeams = rostersData.length;

      const seasonDraftOrder: Record<string, Record<number, number[]>> = {};
      try {
        const draftsRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`);
        const draftsRaw = await draftsRes.json();
        const draftsList = Array.isArray(draftsRaw) ? draftsRaw : [];
        for (const d of draftsList) {
          const draftId = d.draft_id;
          const season = String(d.season || "");
          if (!season || parseInt(season, 10) < currentSeason) continue;
          const draftRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}`);
          if (!draftRes.ok) continue;
          const draft = await draftRes.json();
          const slotToRoster = draft.slot_to_roster_id || {};
          const isSnake = (draft.type || "").toLowerCase() === "snake";
          const round1Order: number[] = [];
          for (let s = 1; s <= numTeams; s++) {
            const rid = slotToRoster[String(s)];
            if (rid != null) round1Order.push(Number(rid));
          }
          if (round1Order.length !== numTeams) continue;
          const byRound: Record<number, number[]> = {};
          for (let r = 1; r <= rounds; r++) {
            byRound[r] = r === 1 || !isSnake ? [...round1Order] : [...round1Order].reverse();
          }
          seasonDraftOrder[season] = byRound;
        }
      } catch (_) {
        /* non-fatal */
      }

      const picksToInsert: InsertDraftPick[] = [];
      for (let year = currentSeason; year < currentSeason + 3; year++) {
        const seasonStr = String(year);
        const draftOrder = seasonDraftOrder[seasonStr];
        for (let round = 1; round <= rounds; round++) {
          const roundOrder = draftOrder?.[round];
          for (const roster of rostersData) {
            const traded = tradedPicks.find(
              (tp: any) =>
                tp.season === seasonStr &&
                tp.round === round &&
                tp.roster_id === roster.roster_id
            );
            let pickSlot: string | null = null;
            if (roundOrder) {
              const pos = roundOrder.indexOf(roster.roster_id);
              if (pos >= 0) pickSlot = `${round}.${String(pos + 1).padStart(2, "0")}`;
            }
            picksToInsert.push({
              leagueId: leagueId,
              season: seasonStr,
              round: round,
              rosterId: roster.roster_id,
              ownerId: traded ? traded.owner_id : roster.roster_id,
              previousOwnerId: traded ? traded.previous_owner_id : null,
              pickSlot,
            });
          }
        }
      }
      await storage.upsertPicks(picksToInsert);

      return jsonResponse(200, api.league.fetch.responses[200].parse({ success: true }));
    }

    if (event.httpMethod === "GET" && getMatch) {
      const leagueId = getMatch[1];
      const league = await storage.getLeague(leagueId);
      if (!league) return jsonResponse(404, { message: "League not found" });

      const rosters = await storage.getRosters(leagueId);
      const users = await storage.getUsers(leagueId);
      const picks = await storage.getPicks(leagueId);
      const teamNeeds: Record<number, { position: string; score: number }[]> = {};
      rosters.forEach((r) => {
        teamNeeds[r.rosterId] = calculateTeamNeeds(r, rosters);
      });

      const teamOrder = await storage.getLeagueTeamOrder(leagueId);
      return jsonResponse(200, { league, rosters, users, picks, teamNeeds, ...(teamOrder && { teamOrder }) });
    }

    if (event.httpMethod === "PUT" && teamOrderMatch) {
      const leagueId = teamOrderMatch[1];
      const league = await storage.getLeague(leagueId);
      if (!league) return jsonResponse(404, { message: "League not found" });
      const body = event.body ? JSON.parse(event.body) : {};
      const order = Array.isArray(body?.order) ? body.order.map(Number).filter((n: number) => Number.isFinite(n)) : [];
      if (order.length === 0) return jsonResponse(400, { message: "order must be a non-empty array of roster IDs" });
      await storage.setLeagueTeamOrder(leagueId, order);
      return jsonResponse(200, { success: true });
    }

    if (event.httpMethod === "PATCH" && pickMatch) {
      const id = parseInt(pickMatch[1], 10);
      const body = event.body ? JSON.parse(event.body) : {};
      const input = api.picks.update.input.parse(body);
      const updated = await storage.updatePick(id, input);
      if (!updated) return jsonResponse(404, { message: "Pick not found" });
      return jsonResponse(200, updated);
    }

    return jsonResponse(404, { message: "Not found" });
  } catch (e: any) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("API error:", err.message, err.stack);
    if (err.message === "League not found") return jsonResponse(404, { message: err.message });
    if (e instanceof z.ZodError) return jsonResponse(400, { message: e.errors[0]?.message || "Validation error" });
    return jsonResponse(500, {
      message: err.message || "Internal server error",
      hint: "Check Netlify Functions logs and DATABASE_URL. Use Supabase pooler (port 6543) for serverless.",
    });
  }
};

export { handler };
