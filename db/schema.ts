import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const masterProfiles = sqliteTable('master_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  profileJson: text('profile_json').notNull(),
  sourceFileKey: text('source_file_key'),
  sourceFileName: text('source_file_name'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_master_profiles_user_id').on(table.userId)]);

export const jobApplications = sqliteTable('job_applications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  company: text('company').notNull(),
  jobTitle: text('job_title').notNull(),
  status: text('status').notNull(),
  matchScore: integer('match_score').notNull(),
  applicationJson: text('application_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_job_applications_user_created').on(table.userId, table.createdAt),
  index('idx_job_applications_user_status').on(table.userId, table.status),
]);

export const resumeVersions = sqliteTable('resume_versions', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull().references(() => jobApplications.id, { onDelete: 'cascade' }),
  resumeJson: text('resume_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_resume_versions_application').on(table.applicationId)]);

export const uploadedFiles = sqliteTable('uploaded_files', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_uploaded_files_user').on(table.userId)]);
