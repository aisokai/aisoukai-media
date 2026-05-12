import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

const POSTS_DIR = path.join(process.cwd(), 'content/posts');

// reviewed: true かつ draft でない記事のみ公開対象とする。
// publish_at が設定されている場合は当日以降のみ公開対象とする（スケジュール公開の最小実装）。
// AI生成記事は生成時 reviewed: false で作られ、Human approval 後に reviewed: true へ変更する。
function isPublishReady(data: Record<string, unknown>): boolean {
  if (data['reviewed'] !== true || data['draft'] === true) return false

  const publishAt = data['publish_at']
  if (publishAt) {
    const publishAtStr = publishAt instanceof Date
      ? publishAt.toISOString().slice(0, 10)
      : String(publishAt)
    const today = new Date().toISOString().slice(0, 10)
    if (publishAtStr > today) return false
  }

  return true
}

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  category: string;
  tags: string[];
  reviewed: boolean;
  image?: string;
  publishAt?: string;        // スケジュール公開日（省略時は date を公開日とする）
  reviewedAt?: string;       // Human approval 日
  reviewedBy?: string;       // 承認者名
  aiGenerated?: boolean;
};

export type Post = PostMeta & {
  contentHtml: string;
};

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(POSTS_DIR)) return [];

  const fileNames = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));

  const posts = fileNames
    .filter((fileName) => {
      const fullPath = path.join(POSTS_DIR, fileName);
      const { data } = matter(fs.readFileSync(fullPath, 'utf8'));
      return isPublishReady(data as Record<string, unknown>);
    })
    .map((fileName): PostMeta => {
      const slug = fileName.replace(/\.md$/, '');
      const fullPath = path.join(POSTS_DIR, fileName);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const { data } = matter(fileContents);

      return {
        slug,
        title: data.title as string,
        date: data.date as string,
        excerpt: (data.excerpt ?? data.description) as string,
        category: data.category as string,
        tags: (data.tags as string[]) ?? [],
        reviewed: true,
        image: data.image as string | undefined,
        publishAt: data.publish_at as string | undefined,
        reviewedAt: data.reviewed_at as string | undefined,
        reviewedBy: data.reviewed_by as string | undefined,
        aiGenerated: data.ai_generated === true,
      };
    });

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// contentHtml は remark-html(sanitize:true) で処理済みの信頼済みHTML。
// content/posts/ は管理者のみ編集可能なため XSS リスクなし。
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const fullPath = path.join(POSTS_DIR, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);

  if (!isPublishReady(data as Record<string, unknown>)) return null;

  const processed = await remark()
    .use(remarkHtml, { sanitize: true })
    .process(content);
  const contentHtml = processed.toString();

  return {
    slug,
    title: data.title as string,
    date: data.date as string,
    excerpt: (data.excerpt ?? data.description) as string,
    category: data.category as string,
    tags: (data.tags as string[]) ?? [],
    reviewed: data.reviewed === true,
    image: data.image as string | undefined,
    contentHtml,
  };
}
