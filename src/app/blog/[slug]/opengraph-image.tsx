// opengraph-image.tsx
// OGP 画像の最小雛形。フォント DL なし・外部通信なし・build 安定性優先。
// reviewed:true の記事のみここに到達する（getPostBySlug が null を返せば fallback を返す）。
import { ImageResponse } from 'next/og'
import { getPostBySlug } from '@/lib/posts'
import { SITE_NAME } from '@/lib/seo'

export const runtime = 'nodejs'
export const size    = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post     = await getPostBySlug(slug)

  // 未承認 or 存在しない記事は fallback
  if (!post) {
    return new ImageResponse(
      <div
        style={{
          display:        'flex',
          width:          '100%',
          height:         '100%',
          background:     '#1e3a5f',
          alignItems:     'center',
          justifyContent: 'center',
          color:          'white',
          fontSize:        32,
        }}
      >
        {SITE_NAME}
      </div>,
      size,
    )
  }

  return new ImageResponse(
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        justifyContent:'center',
        padding:       '60px 72px',
        width:         '100%',
        height:        '100%',
        background:    '#1e3a5f',
        color:         'white',
        fontFamily:    'sans-serif',
      }}
    >
      {/* カテゴリラベル */}
      <div
        style={{
          display:      'flex',
          background:   'rgba(255,255,255,0.15)',
          borderRadius: 6,
          padding:      '6px 16px',
          fontSize:     22,
          marginBottom: 24,
          width:        'fit-content',
        }}
      >
        {post.category}
      </div>

      {/* タイトル */}
      <div
        style={{
          fontSize:   post.title.length > 30 ? 44 : 52,
          fontWeight: 700,
          lineHeight: 1.35,
          marginBottom: 32,
        }}
      >
        {post.title}
      </div>

      {/* サイト名 */}
      <div style={{ fontSize: 24, opacity: 0.7 }}>{SITE_NAME}</div>
    </div>,
    size,
  )
}
