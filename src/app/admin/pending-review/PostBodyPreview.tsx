'use client';

import { useState } from 'react';

interface PostBodyPreviewProps {
  contentHtml: string;
}

export default function PostBodyPreview({ contentHtml }: PostBodyPreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 active:bg-gray-100"
      >
        {open ? '本文を閉じる ▲' : '本文を開く ▼'}
      </button>

      {open && (
        <div
          className="mt-3 max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-700
            [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-800
            [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-700
            [&_p]:mb-3
            [&_ul]:mb-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:ml-5 [&_ol]:list-decimal
            [&_li]:mb-1
            [&_strong]:font-semibold [&_strong]:text-gray-800
            [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:text-xs"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      )}
    </div>
  );
}
