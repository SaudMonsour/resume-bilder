CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `master_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	`profile_json` text NOT NULL,
	`source_file_key` text,
	`source_file_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_master_profiles_user_id` ON `master_profiles` (`user_id`);
--> statement-breakpoint
CREATE TABLE `job_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	`company` text NOT NULL,
	`job_title` text NOT NULL,
	`status` text NOT NULL,
	`match_score` integer NOT NULL,
	`application_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_job_applications_user_created` ON `job_applications` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_job_applications_user_status` ON `job_applications` (`user_id`,`status`);
--> statement-breakpoint
CREATE TABLE `resume_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
	`resume_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_resume_versions_application` ON `resume_versions` (`application_id`);
--> statement-breakpoint
CREATE TABLE `uploaded_files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_uploaded_files_user` ON `uploaded_files` (`user_id`);
