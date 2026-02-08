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
  const pickMatch = path.match(/^\/api\/picks\/(\d+)$/);

  try {
    if (event.httpMethod === "POST" && pathMatch) {
      const leagueId = pathMatch[1];
      const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
      if (!leagueRes.ok) throw new Error("League not found");
      const leagueData = await leagueRes.json();

      await storage.upsertLeague({
        leagueId: leagueData.league_id,
        name: leagueData.name,
        totalRosters: leagueData.total_rosters,
        season: leagueData.season,
        avatar: leagueData.avatar,
        settings: leagueData.settings,
      });

      const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
      const usersData = await usersRes.json();
      const usersList = usersData.map((u: any) => ({
        userId: u.user_id,
        leagueId: leagueId,
        displayName: u.display_name,
        avatar: u.avatar,
      }));
      await storage.upsertUsers(usersList);

      const rostersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
      const rostersData = await rostersRes.json();
      const rostersList = rostersData.map((r: any) => ({
        leagueId: leagueId,
        rosterId: r.roster_id,
        ownerId: r.owner_id,
        settings: r.settings,
      }));
      await storage.upsertRosters(rostersList);

      const tradedRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`);
      const tradedPicks = await tradedRes.json();

      await storage.clearPicks(leagueId);

      const picksToInsert: InsertDraftPick[] = [];
      const currentSeason = parseInt(leagueData.season);
      const rounds = leagueData.settings?.draft_rounds || 3;

      for (let year = currentSeason; year < currentSeason + 3; year++) {
        for (let round = 1; round <= rounds; round++) {
          for (const roster of rostersData) {
            const traded = tradedPicks.find(
              (tp: any) =>
                tp.season === String(year) &&
                tp.round === round &&
                tp.roster_id === roster.roster_id
            );
            picksToInsert.push({
              leagueId: leagueId,
              season: String(year),
              round: round,
              rosterId: roster.roster_id,
              ownerId: traded ? traded.owner_id : roster.roster_id,
              previousOwnerId: traded ? traded.previous_owner_id : null,
              pickSlot: null,
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

      return jsonResponse(200, { league, rosters, users, picks, teamNeeds });
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
    console.error("API error:", e);
    if (e.message === "League not found") return jsonResponse(404, { message: e.message });
    if (e instanceof z.ZodError) return jsonResponse(400, { message: e.errors[0]?.message || "Validation error" });
    return jsonResponse(500, { message: e.message || "Internal server error" });
  }
};

export { handler };
