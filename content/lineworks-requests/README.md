# LINE WORKS Requests

LINE WORKS経由の制作指示 (v1はmock受信のみ)。

- 受付: `npm run media:lineworks:dry-run -- --input "指示文"`

LINE WORKSへの送信・通知機能は存在しない。受信した指示は media queue item に変換される。
