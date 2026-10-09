import type { NextConfig } from 'next'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

// Images remain in public/CDN. Only function copies that no deployed article
// can ask the publication hash verifier to read may be omitted.
function unusedImageFiles(root: string): string[] {
  try {
    const files = (directory: string): string[] => {
      const directoryState = fs.lstatSync(path.join(root, directory))
      if (!directoryState.isDirectory() || directoryState.isSymbolicLink()) throw new Error('trace_directory_unknown')
      return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
      if (entry.isSymbolicLink()) throw new Error('trace_symlink')
      const name = `${directory}/${entry.name}`
      if (entry.isDirectory()) return files(name)
      if (!entry.isFile()) throw new Error('trace_not_regular')
      return [name]
    })
    }
    const referenced = new Set<string>()
    for (const filename of files('content/posts').filter(name => name.endsWith('.md'))) {
      // Decode only the frontmatter, not the article body. Uncertain input keeps
      // every image; this optimization must never change publication eligibility.
      const fd = fs.openSync(path.join(root, filename), 'r')
      const buffer = Buffer.alloc(128 * 1024)
      let size: number
      try { size = fs.readSync(fd, buffer, 0, buffer.length, 0) } finally { fs.closeSync(fd) }
      const bytes = buffer.subarray(0, size)
      if (!bytes.subarray(0, 4).equals(Buffer.from('---\n')) && !bytes.subarray(0, 5).equals(Buffer.from('---\r\n'))) throw new Error('trace_header_unknown')
      let end = bytes.indexOf(Buffer.from('\n---'), 4)
      while (end >= 0 && ![10, 13, undefined].includes(bytes[end + 4])) end = bytes.indexOf(Buffer.from('\n---'), end + 1)
      if (end < 0) throw new Error('trace_header_unknown')
      const image = matter(bytes.subarray(0, end + 4).toString('utf8') + '\n').data.image
      if (image === undefined || image === '') continue
      if (typeof image !== 'string' || !/^\/images\/[A-Za-z0-9_./-]+$/.test(image) || image.includes('..')) throw new Error('trace_image_unknown')
      referenced.add(path.posix.normalize(`public${image}`))
    }
    return files('public/images')
      .filter(name => /^[A-Za-z0-9_./-]+$/.test(name) && !name.includes('..') && !referenced.has(name))
      .sort().map(name => `./${name}`)
  } catch {
    return []
  }
}

export default function nextConfig(phase: string): NextConfig {
  const excluded = phase === 'phase-production-build' ? unusedImageFiles(process.cwd()) : []
  return excluded.length ? { outputFileTracingExcludes: { '/*': excluded } } : {}
}
