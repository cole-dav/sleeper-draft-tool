import { pgTable, text, serial, integer, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Store league metadata
export const leagues = pgTable("leagues", {
  leagueId: text("league_id").primaryKey(),
  name: text("name").notNull(),
  totalRosters: integer("total_rosters").notNull(),
  season: text("season").notNull(),
  avatar: text("avatar"),
  settings: jsonb("settings").notNull(), // Store draft rounds, etc.
});

// Store roster information (team owners)
export const rosters = pgTable("rosters", {
  id: serial("id").primaryKey(),
  leagueId: text("league_id").notNull(),
  rosterId: integer("roster_id").notNull(), // 1, 2, 3...
  ownerId: text("owner_id"), // Sleeper user ID
  settings: jsonb("settings"), // Wins, losses, fpts, etc.
});

// Store user details (for display names, avatars)
export const users = pgTable("users", {
  userId: text("user_id").primaryKey(),
  leagueId: text("league_id").notNull(),
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
});

// Stored display order of teams (roster IDs) for draft board columns
export const leagueTeamOrder = pgTable("league_team_order", {
  leagueId: text("league_id").primaryKey(),
  order: jsonb("order").notNull(), // number[] - roster IDs in display order
});

// Store resolved draft picks (both original and traded)
export const draftPicks = pgTable("draft_picks", {
  id: serial("id").primaryKey(),
  leagueId: text("league_id").notNull(),
  season: text("season").notNull(),
  round: integer("round").notNull(),
  rosterId: integer("roster_id").notNull(), // Original owner roster ID (determines pick slot usually)
  ownerId: integer("owner_id").notNull(), // Current owner roster ID
  previousOwnerId: integer("previous_owner_id"), // Who traded it (if applicable)
  pickSlot: text("pick_slot"), // User manual override (e.g. "1.01", "Early 1st")
  comment: text("comment"), // User prediction/note
});

// Zod Schemas
export const insertLeagueSchema = createInsertSchema(leagues);
export const insertRosterSchema = createInsertSchema(rosters);
export const insertUserSchema = createInsertSchema(users);
export const insertDraftPickSchema = createInsertSchema(draftPicks).omit({ id: true });
export const updateDraftPickSchema = createInsertSchema(draftPicks).pick({ pickSlot: true, comment: true });

// Types
export type League = typeof leagues.$inferSelect;
export type Roster = typeof rosters.$inferSelect;
export type User = typeof users.$inferSelect;
export type LeagueTeamOrder = typeof leagueTeamOrder.$inferSelect;
export type DraftPick = typeof draftPicks.$inferSelect;
export type UpdateDraftPick = z.infer<typeof updateDraftPickSchema>;
export type InsertLeague = typeof leagues.$inferInsert;
export type InsertRoster = typeof rosters.$inferInsert;
export type InsertUser = typeof users.$inferInsert;
export type InsertDraftPick = typeof draftPicks.$inferInsert;

// API Response Types
export type LeagueDataResponse = {
  league: League;
  rosters: Roster[];
  users: User[];
  picks: DraftPick[];
  teamNeeds: Record<number, { position: string; score: number }[]>; // rosterId -> needs
  teamOrder?: number[]; // saved column order (roster IDs), if set
};
