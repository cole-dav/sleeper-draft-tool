import { db } from "./db";
import {
  leagues, rosters, users, draftPicks, leagueTeamOrder,
  type League, type Roster, type User, type DraftPick, type UpdateDraftPick,
  type InsertLeague, type InsertRoster, type InsertUser, type InsertDraftPick
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // League
  getLeague(leagueId: string): Promise<League | undefined>;
  upsertLeague(league: InsertLeague): Promise<League>;

  // Rosters
  getRosters(leagueId: string): Promise<Roster[]>;
  upsertRoster(roster: InsertRoster): Promise<Roster>;
  upsertRosters(rostersList: InsertRoster[]): Promise<Roster[]>;

  // Users
  getUsers(leagueId: string): Promise<User[]>;
  upsertUser(user: InsertUser): Promise<User>;
  upsertUsers(usersList: InsertUser[]): Promise<User[]>;

  // Picks
  getPicks(leagueId: string): Promise<DraftPick[]>;
  upsertPick(pick: InsertDraftPick): Promise<DraftPick>;
  upsertPicks(picksList: InsertDraftPick[]): Promise<DraftPick[]>;
  updatePick(id: number, update: UpdateDraftPick): Promise<DraftPick | undefined>;
  
  // Clear existing picks for a league to avoid duplicates during re-fetch
  clearPicks(leagueId: string): Promise<void>;

  // Team display order (draft board columns)
  getLeagueTeamOrder(leagueId: string): Promise<number[] | undefined>;
  setLeagueTeamOrder(leagueId: string, order: number[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private isUndefinedTableError(err: unknown): boolean {
    return Boolean(err && typeof err === "object" && "code" in err && (err as any).code === "42P01");
  }
  async getLeague(leagueId: string): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.leagueId, leagueId));
    return league;
  }

  async upsertLeague(league: InsertLeague): Promise<League> {
    const [result] = await db.insert(leagues).values(league)
      .onConflictDoUpdate({ target: leagues.leagueId, set: league })
      .returning();
    return result;
  }

  async getRosters(leagueId: string): Promise<Roster[]> {
    return db.select().from(rosters).where(eq(rosters.leagueId, leagueId));
  }

  async upsertRoster(roster: InsertRoster): Promise<Roster> {
    // We assume rosterId + leagueId is unique logic, but we only have a surrogate key 'id'.
    // We should check if it exists first or use a unique constraint if we added one. 
    // For simplicity, we'll delete matching roster first or find it.
    // Ideally we should have a composite key on leagueId + rosterId in schema, but we defined 'id' serial.
    // Let's find by rosterId + leagueId first.
    const [existing] = await db.select().from(rosters).where(and(eq(rosters.leagueId, roster.leagueId), eq(rosters.rosterId, roster.rosterId)));
    
    if (existing) {
      const [updated] = await db.update(rosters).set(roster).where(eq(rosters.id, existing.id)).returning();
      return updated;
    } else {
      const [inserted] = await db.insert(rosters).values(roster).returning();
      return inserted;
    }
  }

  async upsertRosters(rostersList: InsertRoster[]): Promise<Roster[]> {
    // This is slow but safe given our schema limitations.
    const results = [];
    for (const r of rostersList) {
      results.push(await this.upsertRoster(r));
    }
    return results;
  }

  async getUsers(leagueId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.leagueId, leagueId));
  }

  async upsertUser(user: InsertUser): Promise<User> {
    const [result] = await db.insert(users).values(user)
      .onConflictDoUpdate({ target: users.userId, set: user })
      .returning();
    return result;
  }

  async upsertUsers(usersList: InsertUser[]): Promise<User[]> {
    if (usersList.length === 0) return [];
    const results: User[] = [];
    for (const user of usersList) {
      results.push(await this.upsertUser(user));
    }
    return results;
  }

  async getPicks(leagueId: string): Promise<DraftPick[]> {
    return db.select().from(draftPicks).where(eq(draftPicks.leagueId, leagueId));
  }

  async clearPicks(leagueId: string): Promise<void> {
    await db.delete(draftPicks).where(eq(draftPicks.leagueId, leagueId));
  }

  async upsertPick(pick: InsertDraftPick): Promise<DraftPick> {
    const [result] = await db.insert(draftPicks).values(pick).returning();
    return result;
  }

  async upsertPicks(picksList: InsertDraftPick[]): Promise<DraftPick[]> {
    if (picksList.length === 0) return [];
    return db.insert(draftPicks).values(picksList).returning();
  }

  async updatePick(id: number, update: UpdateDraftPick): Promise<DraftPick | undefined> {
    const [result] = await db.update(draftPicks).set(update).where(eq(draftPicks.id, id)).returning();
    return result;
  }

  async getLeagueTeamOrder(leagueId: string): Promise<number[] | undefined> {
    try {
      const [row] = await db.select().from(leagueTeamOrder).where(eq(leagueTeamOrder.leagueId, leagueId));
      if (!row?.order || !Array.isArray(row.order)) return undefined;
      return row.order as number[];
    } catch (err) {
      if (this.isUndefinedTableError(err)) return undefined;
      throw err;
    }
  }

  async setLeagueTeamOrder(leagueId: string, order: number[]): Promise<void> {
    try {
      await db.insert(leagueTeamOrder).values({ leagueId, order })
        .onConflictDoUpdate({ target: leagueTeamOrder.leagueId, set: { order } });
    } catch (err) {
      if (this.isUndefinedTableError(err)) return;
      throw err;
    }
  }
}

export const storage = new DatabaseStorage();
