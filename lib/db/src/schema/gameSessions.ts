import { sql } from "drizzle-orm";
import { jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const gameSessionsTable = pgTable("game_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type GameSession = typeof gameSessionsTable.$inferSelect;
export type InsertGameSession = typeof gameSessionsTable.$inferInsert;
