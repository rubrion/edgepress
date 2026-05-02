CREATE TABLE `ai_usage` (
	`day` text PRIMARY KEY NOT NULL,
	`tokens_used` integer DEFAULT 0 NOT NULL
);
