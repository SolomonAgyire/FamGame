CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'LOBBY' NOT NULL,
	`mode` text DEFAULT 'individuals' NOT NULL,
	`settings_json` text NOT NULL,
	`players_json` text NOT NULL,
	`match_json` text,
	`current_index` integer DEFAULT 0 NOT NULL,
	`puzzle_status` text DEFAULT 'WAITING' NOT NULL,
	`resolution_json` text,
	`hint_state_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity` integer NOT NULL,
	`expires_at` integer NOT NULL
);
