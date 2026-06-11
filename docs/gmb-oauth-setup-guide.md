# GMB (Google Business Profile) API 接続手順書 (先生向け)

- 作成日: 2026-06-11
- 前提: **GBP API の利用承認メール受領済み**(確認済み)
- 所要時間目安: 20〜30分。すべて先生の操作です(認証情報はAIに渡さない・チャットに貼らない)。

---

## Step 1: API有効化 (Google Cloud Console)

1. https://console.cloud.google.com/ → 承認を受けたプロジェクトを選択
2. 「APIとサービス → ライブラリ」で以下を検索して**有効化**:
   - Google Business Profile API
   - My Business Account Management API
   - My Business Business Information API

## Step 2: OAuth同意画面

1. 「APIとサービス → OAuth同意画面」
2. User Type: 外部 / アプリ名: aisoukai-media / スコープ: `https://www.googleapis.com/auth/business.manage`
3. テストユーザーに医院のGoogleアカウント(GMB管理者)を追加
4. ※「公開」は不要。テストモードのままで自院利用は可能(refresh tokenの期限に注意。失効したらStep 4を再実行)

## Step 3: OAuthクライアント作成

1. 「認証情報 → 認証情報を作成 → OAuthクライアントID」
2. 種類: **デスクトップアプリ**
3. 表示された クライアントID / クライアントシークレット を `.env.local` に追記:

```
GMB_CLIENT_ID=<クライアントID>
GMB_CLIENT_SECRET=<クライアントシークレット>
```

## Step 4: refresh token 取得 (初回のみ)

```bash
npm run media:gmb:auth -- --url        # 表示されたURLをブラウザで開く → GMB管理者アカウントで承認 → codeをコピー
npm run media:gmb:auth -- --exchange <code> --write-env
```

refresh token は stdout に表示されず、`.env.local` の `GMB_REFRESH_TOKEN` に直接保存されます。
**refresh token は秘密値です。チャット・commit・スクリーンショット・他人への共有に含めないでください。**

## Step 5: location ID 取得

```bash
npm run media:gmb:discover
```

アカウントとlocationが1つずつなら自動で `config/gmb-location.json` に保存されます。
複数ある場合は表示される `--save accounts/...:locations/...` コマンドで選択してください。

※ `config/gmb-location.json` は**ローカル設定ファイル**(gitignore済み・commitしない)。Mac mini入れ替え時はこのStepを再実行してください。

## Step 6: 接続テスト (読み取りのみ)

```bash
npm run media:gmb:reviews:check -- --source api
```

実際の口コミが取得・分類され、返信案が下書きされれば成功です。**この段階で送信は一切起きません。**

## トラブル時

- `HTTP 401/invalid_grant` → refresh token失効。Step 4を再実行
- `403` → Step 1のAPI有効化漏れ、またはGMB管理者でないアカウントで承認した
- 緊急停止: `.env.local` から GMB_* の行を削除すれば全GMB機能が止まります
