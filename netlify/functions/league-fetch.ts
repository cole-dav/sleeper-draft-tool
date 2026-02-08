import type { Handler } from "@netlify/functions";
import { storage } from "../../server/storage";
import { api } from "../../shared/routes";
import type { InsertDraftPick } from "../../shared/schema";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  const leagueId = event.queryStringParameters?.leagueId;
  if (!leagueId) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing league ID" }) };
  }

  try {
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

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(api.league.fetch.responses[200].parse({ success: true })),
    };
  } catch (e: any) {
    console.error("Error fetching sleeper data:", e);
    return {
      statusCode: e.message === "League not found" ? 404 : 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: e.message || "Internal server error" }),
    };
  }
};

export { handler };
