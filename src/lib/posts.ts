import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import { readGitHubDirectory, readGitHubFile } from './githubContents';
import { getDmpArticleState } from './dmpArticleState.mjs';

const POSTS_DIR = path.join(process.cwd(), 'content/posts');

function getTodayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Human が本文確認済み、かつ draft でない記事のみ公開対象とする。
// publish_at または date が今日より未来の場合は公開しない（スケジュール公開）。
// AI生成記事は生成時 reviewed/auto_approved とも false で作られ、
// Human approval 後に reviewed: true / reviewed_at / reviewed_by へ変更する。
function isPublishReady(data: Record<string, unknown>, content = ''): boolean {
  return getDmpArticleState({ data, content, adminDiscoverability: null, today: getTodayJst() }).publishable
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
  imageAlt?: string;         // image の alt テキスト（image_alt frontmatter フィールドから取得）
  publishAt?: string;        // スケジュール公開日（省略時は date を公開日とする）
  reviewedAt?: string;       // Human approval 日
  reviewedBy?: string;       // 承認者名
  autoApproved?: boolean;     // Auto Publish Policy 通過済み
  autoApprovedAt?: string;
  autoApprovedBy?: string;
  publicationStatus?: string;
  medicalRisk?: string;
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
      const { data, content } = matter(fs.readFileSync(fullPath, 'utf8'));
      return isPublishReady(data as Record<string, unknown>, content);
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
        reviewed: data.reviewed === true,
        image:    (data.image as string) || undefined,
        imageAlt: (data.image_alt as string) || undefined,
        publishAt: data.publish_at as string | undefined,
        reviewedAt: data.reviewed_at as string | undefined,
        reviewedBy: data.reviewed_by as string | undefined,
        autoApproved: data.auto_approved === true,
        autoApprovedAt: data.auto_approved_at as string | undefined,
        autoApprovedBy: data.auto_approved_by as string | undefined,
        publicationStatus: data.publication_status as string | undefined,
        medicalRisk: data.medical_risk as string | undefined,
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
  contentHtml: string;
  rejectionReason?: string;
  reviewInvalidationReason?: string;
  image?: string;
  // Exact canonical content hash rendered to the reviewer and required by CAS.
  contentVersion: string;
};

function toDateString(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val ?? '');
}

async function buildPendingReviewPost(fileName: string, raw: string): Promise<PendingReviewPost | null> {
  const { data, content } = matter(raw);

  if (data['archived'] === true) return null;
  const state = getDmpArticleState({ data, content });
  if (state.approvedExactVersion) return null;

  const processed = await remark()
    .use(remarkHtml, { sanitize: true })
    .process(content);

  const publishAtRaw = data['publish_at'];
  return {
    slug:            fileName.replace(/\.md$/, ''),
    title:           String(data['title'] ?? '（タイトル未設定）'),
    date:            toDateString(data['date']),
    publishAt:       publishAtRaw ? toDateString(publishAtRaw) : undefined,
    category:        String(data['category'] ?? '未分類'),
    aiGenerated:     data['ai_generated'] === true,
    excerpt:         String(data['excerpt'] ?? data['description'] ?? ''),
    contentHtml:     processed.toString(),
    rejectionReason: data['rejection_reason'] ? String(data['rejection_reason']) : undefined,
    reviewInvalidationReason: data['review_invalidation_reason'] ? String(data['review_invalidation_reason']) : undefined,
    image:           data['image'] ? String(data['image']) : undefined,
    contentVersion: state.contentVersion,
  };
}

function sortPendingReviewPosts(posts: PendingReviewPost[]) {
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** reviewed !== true の記事をすべて返す（Human review 待ち一覧用）。本文 HTML を含む。 */
export async function getPendingReviewPosts(): Promise<PendingReviewPost[]> {
  if (!fs.existsSync(POSTS_DIR)) return [];

  const fileNames = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const results = await Promise.all(
    fileNames.map((fileName) => {
      const fullPath = path.join(POSTS_DIR, fileName);
      return buildPendingReviewPost(fileName, fs.readFileSync(fullPath, 'utf8'));
    }),
  );

  return sortPendingReviewPosts(results.filter(Boolean) as PendingReviewPost[]);
}

async function getPendingReviewPostsFromGitHub(): Promise<PendingReviewPost[]> {
  const entries = await readGitHubDirectory('content/posts');
  const postFiles = entries
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
    .map((entry) => entry.name);

  const results = await Promise.all(
    postFiles.map(async (fileName) => {
      const file = await readGitHubFile(`content/posts/${fileName}`);
      return buildPendingReviewPost(fileName, file.content);
    }),
  );

  return sortPendingReviewPosts(results.filter(Boolean) as PendingReviewPost[]);
}

export async function getPendingReviewPostsForAdmin(): Promise<PendingReviewPost[]> {
  if (!process.env.GITHUB_REVIEW_TOKEN) return getPendingReviewPosts();

  try {
    return await getPendingReviewPostsFromGitHub();
  } catch (error) {
    console.error('GitHub pending review read failed; falling back to local files', error);
    return getPendingReviewPosts();
  }
}

// contentHtml は remark-html(sanitize:true) で処理済みの信頼済みHTML。
// content/posts/ は管理者のみ編集可能なため XSS リスクなし。
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const fullPath = path.join(POSTS_DIR, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);

  if (!isPublishReady(data as Record<string, unknown>, content)) return null;

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
    image:    (data.image as string) || undefined,
    imageAlt: (data.image_alt as string) || undefined,
    publishAt: data.publish_at as string | undefined,
    reviewedAt: data.reviewed_at as string | undefined,
    reviewedBy: data.reviewed_by as string | undefined,
    autoApproved: data.auto_approved === true,
    autoApprovedAt: data.auto_approved_at as string | undefined,
    autoApprovedBy: data.auto_approved_by as string | undefined,
    publicationStatus: data.publication_status as string | undefined,
    medicalRisk: data.medical_risk as string | undefined,
    aiGenerated: data.ai_generated === true,
    contentHtml,
  };
}
