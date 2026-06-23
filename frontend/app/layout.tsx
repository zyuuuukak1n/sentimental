// frontend/app/layout.tsx
import './globals.css'; // ← これがTailwind CSSを読み込む必須設定です！

export const metadata = {
  title: 'Sentimental',
  description: 'ストレス発散アプリ',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}