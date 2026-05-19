import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().unique(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  currentStage: text('current_stage'),
  progress: real('progress').notNull().default(0),
  errorJson: text('error_json'),
  videoFileName: text('video_file_name').notNull(),
  subtitleFileName: text('subtitle_file_name'),
  slidesFileName: text('slides_file_name'),
  videoDurationSec: real('video_duration_sec'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const stageEvents = sqliteTable('stage_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  stage: text('stage'),
  payloadJson: text('payload_json').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  speakerJson: text('speaker_json'),
  stepsJson: text('steps_json').notNull(),
  aiSettingsJson: text('ai_settings_json').notNull(),
  lastEditedAt: integer('last_edited_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type TaskRow = typeof tasks.$inferSelect;
export type TaskInsert = typeof tasks.$inferInsert;
export type StageEventRow = typeof stageEvents.$inferSelect;
export type StageEventInsert = typeof stageEvents.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;
