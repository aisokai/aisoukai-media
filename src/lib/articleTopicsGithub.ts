import { ARTICLE_TOPICS_RELATIVE_PATH } from './articleTopics'
import { commitGitHubFiles, readGitHubFile } from './githubContents'

export const ARTICLE_TOPICS_GITHUB_REF = 'main'

export async function readGitHubArticleTopicsCsv() {
  return (await readGitHubFile(ARTICLE_TOPICS_RELATIVE_PATH, { ref: ARTICLE_TOPICS_GITHUB_REF })).content
}

export async function commitGitHubArticleTopicsCsv(content: string, id: string) {
  return commitGitHubFiles(`update article topic: ${id}`, [
    { path: ARTICLE_TOPICS_RELATIVE_PATH, content },
  ], { branch: ARTICLE_TOPICS_GITHUB_REF })
}
