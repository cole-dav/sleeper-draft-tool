import type { Handler } from "@netlify/functions";
import { storage } from "../../server/storage";

const POSITIONAL_WEIGHTS: Record<string, number> = {
  QB: 25,
  RB: 15,
  WR: 20,
  TE: 15,
  K: 1,
  DEF: 2,
};

function calculateTeamNeeds(_roster: any, _allRosters: any[]) {
  const positions = ["QB", "RB", "WR", "TE"];
  return positions
    .map((pos) => ({
      position: pos,
      score: Math.floor(Math.random() * 100),
    }))
    .sort((a, b) => b.score - a.score);
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  const leagueId = event.queryStringParameters?.leagueId;
  if (!leagueId) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing league ID" }) };
  }

  try {
    const league = await storage.getLeague(leagueId);
    if (!league) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "League not found" }),
      };
    }

    const rosters = await storage.getRosters(leagueId);
    const users = await storage.getUsers(leagueId);
    const picks = await storage.getPicks(leagueId);

    const teamNeeds: Record<number, { position: string; score: number }[]> = {};
    rosters.forEach((r) => {
      teamNeeds[r.rosterId] = calculateTeamNeeds(r, rosters);
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        league,
        rosters,
        users,
        picks,
        teamNeeds,
      }),
    };
  } catch (e: any) {
    console.error("Error fetching league:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: e.message || "Internal server error" }),
    };
  }
};

export { handler };
