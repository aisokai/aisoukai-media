# 月次ネタ候補ワークフロー

週3回投稿を前提に、毎月1回だけ翌月分のネタ候補を確認する運用です。

## 月初の流れ

1. 翌月分の候補を24件生成する。

```bash
npm run topic-candidates:generate -- --month 2026-07 --yes
```

2. 候補データを検証する。

```bash
npm run topic-candidates:validate -- --month 2026-07
```

3. TelegramでPC確認リマインドを送る。

```bash
npm run notify:topic-candidates -- --month 2026-07
```

4. PCで管理画面を開き、12件を「今月採用」にする。

```text
/admin/topic-candidates?month=2026-07
```

5. 採用済み候補を記事ネタCSVへ変換する。

```bash
npm run topic-candidates:convert -- --month 2026-07 --yes
```

6. 既存フローで記事ドラフトを生成する。

```bash
npm run generate:draft -- MONTHLY-202607TOPIC001
```

## 役割分担

- PC: 24件の一覧確認、カテゴリ偏り、重複リスク、高リスク候補の確認。
- スマホ: 簡易的な採用、予備、保留、却下の判断。
- Telegram: 詳細確認ではなく、PC確認のリマインド。

## 安全ルール

- ネタ候補の採用だけでは記事公開しない。
- 採用後も記事生成、医療リーガルチェック、画像確認、最終承認を通す。
- `medicalRisk: high` の候補は、記事化前に扱い方を確認する。
- 却下・保留理由は `reviewerNote` に残し、次回の候補作成の参考にする。
