import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const subscribers = sqliteTable('subscribers', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  status: text('status', { enum: ['active', 'unsubscribed'] })
    .notNull()
    .default('active'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const posts = sqliteTable('posts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  contentHtml: text('content_html').notNull(),
  contentMd: text('content_md').notNull(),
  isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
});

export const campaigns = sqliteTable('campaigns', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  postId: text('post_id')
    .notNull()
    .references(() => posts.id),
  sentAt: integer('sent_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  status: text('status', { enum: ['sent', 'partial', 'failed'] }).notNull(),
  providerUsed: text('provider_used', { enum: ['RESEND', 'GMAIL'] }).notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
