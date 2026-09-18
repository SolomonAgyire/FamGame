import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  status: text('status').notNull().default('LOBBY'),
  mode: text('mode').notNull().default('individuals'),
  settingsJson: text('settings_json').notNull(),
  playersJson: text('players_json').notNull(),
  matchJson: text('match_json'),
  currentIndex: integer('current_index').notNull().default(0),
  puzzleStatus: text('puzzle_status').notNull().default('WAITING'),
  resolutionJson: text('resolution_json'),
  hintStateJson: text('hint_state_json').notNull().default('{}'),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  lastActivity: integer('last_activity').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
