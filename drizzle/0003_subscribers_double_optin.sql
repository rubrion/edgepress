ALTER TABLE `subscribers` ADD COLUMN `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `subscribers` ADD COLUMN `confirm_token` text;--> statement-breakpoint
ALTER TABLE `subscribers` ADD COLUMN `confirm_token_expires_at` integer;--> statement-breakpoint
CREATE INDEX `subscribers_confirm_token_idx` ON `subscribers` (`confirm_token`);
