import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

const POSTS_DIR = path.join(process.cwd(), 'content/posts');

// reviewed: true かつ draft でない記事のみ公開対象とする。
// publish_at または date が今日より未来の場合は公開しない（スケジュール公開）。
// AI生成記事は生成時 reviewed: false で作られ、Human approval 後に reviewed: true へ変更する。
function isPublishReady(data: Record<string, unknown>): boolean {
  if (data['reviewed'] !== true || data['draft'] === true) return false

  const today = new Date().toISOString().slice(0, 10)

  const toStr = (v: unknown): string =>
    v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '')

  // publish_at が設定されていれば優先して未来判定する
  const publishAt = data['publish_at']
  if (publishAt && toStr(publishAt) > today) return false

  // publish_at がない場合は date を未来判定に使う
  if (!publishAt) {
    const dateVal = data['date']
    if (dateVal && toStr(dateVal) > today) return false
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

export type PendingReviewPost = {
  slug: string;
  title: string;
  date: string;
  publishAt?: string;
  category: string;
  aiGenerated: boolean;
  excerpt: string;
  rejectionReason?: string;
};

function toDateString(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val ?? '');
}

/** reviewed !== true の記事をすべて返す（Human review 待ち一覧用）。本文は含まない。 */
export function getPendingReviewPosts(): PendingReviewPost[] {
  if (!fs.existsSync(POSTS_DIR)) return [];

  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((fileName) => {
      const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, fileName), 'utf8'));
      return data['reviewed'] !== true;
    })
    .map((fileName): PendingReviewPost => {
      const slug = fileName.replace(/\.md$/, '');
      const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, fileName), 'utf8'));
      const publishAtRaw = data['publish_at'];
      return {
        slug,
        title:           String(data['title'] ?? '（タイトル未設定）'),
        date:            toDateString(data['date']),
        publishAt:       publishAtRaw ? toDateString(publishAtRaw) : undefined,
        category:        String(data['category'] ?? '未分類'),
        aiGenerated:     data['ai_generated'] === true,
        excerpt:         String(data['excerpt'] ?? data['description'] ?? ''),
        rejectionReason: data['rejection_reason'] ? String(data['rejection_reason']) : undefined,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
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
