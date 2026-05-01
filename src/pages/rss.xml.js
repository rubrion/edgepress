import rss from '@astrojs/rss';
import { desc, eq } from 'drizzle-orm';
import { getDbInstance, posts } from '../db';
import { loadSettings } from '../lib/settings';

export async function GET(context) {
	const settings = await loadSettings();
	const clientName = settings.clientName;
	const description = `Latest posts from ${clientName}.`;

	const db = getDbInstance();
	const rows = await db
		.select({
			title: posts.title,
			slug: posts.slug,
			contentMd: posts.contentMd,
			publishedAt: posts.publishedAt,
		})
		.from(posts)
		.where(eq(posts.isPublished, true))
		.orderBy(desc(posts.publishedAt));

	return rss({
		title: clientName,
		description,
		site: context.site,
		items: rows.map((p) => ({
			title: p.title,
			pubDate: p.publishedAt ?? new Date(),
			description: p.contentMd.slice(0, 240),
			link: `/blog/${p.slug}`,
		})),
	});
}
