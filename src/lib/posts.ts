import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

const POSTS_DIR = path.join(process.cwd(), 'content/posts');

// reviewed: true かつ draft でない記事のみ公開対象とする。
// AI生成記事は生成時 reviewed: false で作られ、Human approval 後に reviewed: true へ変更する。
function isPublishReady(data: Record<string, unknown>): boolean {
  return data['reviewed'] === true && data['draft'] !== true
}

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  category: string;
  tags: string[];
  reviewed: boolean;
  image?: string;   // frontmatter の image フィールド（省略可）
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
