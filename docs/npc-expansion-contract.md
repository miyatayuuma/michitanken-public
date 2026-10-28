# NPC拡張データ契約 v1（PUBLICエンジン）

## 目的

**プログラムを書き換えずに、新しいキャラクター、画像ZIP、会話本文を追加する。**
作品の選定、口調、会話の意味、物語上の伏線は本契約では決定しない。
PUBLICには実在地理座標、児童の読書履歴、未承認の原稿・画像を置かない。

## 正本と責務

| ファイル | 役割 | 保存先 |
|---|---|---|
| `lib/npc-catalog.mjs` | ID・参照整合性、話者検証、既存会話形式への変換 | PUBLIC |
| `src/npc.js` | 描画、ZIP単位のローカル画像登録、歩行、会話UI | PUBLIC |
| `lib/npc.mjs` | 既存の初対面・再会・通常会話進行と保存 | PUBLIC |
| `public/data/npc-catalog.json` | 登場人物、画像パック、話者ID付き会話本文 | PRIVATE |
| `public/data/npcs.json` | 配置場所、表示高、会話セット参照、出会い地点ID | PRIVATE |
| `private-assets/npc-sprites/` | PNG原本。Hostingに含めない | PRIVATE |
| `scripts/package-npc-images.py` | 指定画像パックのローカルZIPを生成 | PRIVATE |

本番配信時、`npc-catalog.json`の**内容は閲覧可能**になる。読書履歴、
非公開ストーリー原稿、API認証情報は入れない。

## 識別子を混同しない

- `characters[].id`：**話者ID**。声・口調・相互作用の将来の正本。
- `characters[].spriteId`：画像キー。複数話者で同じ画像を共有できる。
- `spritePacks[].id`：ZIP登録単位。既存9枚と追加パックを独立に取り込む。
- `dialogueSets[].id`：**キャスト／会話セットID**。複数地点で再利用可能。
- `npcs.groups[].groupId`：**遭遇地点ID**。地図の★と既存の初対面・再会保存に使用。
- `npcs.groups[].dialogueId`：会話セットへの参照。同じ人物が複数地点に出る場合も共通。

`groupId`を改名すると既存の出会い記録を失うため、公開後は固定する。

## スキーマ例（架空人物のみ）

```json
{
  "schema": 1,
  "characters": [
    {"id": "fox", "name": "きつね", "spriteId": "fox"},
    {"id": "bird", "name": "ことり", "spriteId": "bird"}
  ],
  "spritePacks": [
    {"id": "forest-pair", "name": "森のふたり", "spriteIds": ["fox", "bird"]}
  ],
  "dialogueSets": [
    {
      "id": "forest-pair",
      "members": ["fox", "bird"],
      "first": [["fox", "こんにちは。"], ["bird", "はじめまして！"]],
      "again": [["bird", "また会えたね。"]],
      "normal": [[["fox", "今日はどこへ？"], ["bird", "まだ内緒。"]]]
    }
  ]
}
```

同じキャストを別の遭遇地点へ出すには、PRIVATEの`npcs.json`で
`groupId`だけを別IDにし、`dialogueId`を同じにする。
`members`のID集合と`dialogueSets[].members`は一致させること。

ふたごのような2話者・1画像は、会話セットに
`"sharedSpriteId": "twins"`を指定する。

## 画像追加

- PRIVATEの`private-assets/npc-sprites/<spriteId>.png`へ原本を置く。
- `npc-catalog.json`に話者・画像パック・会話セットを追加する。
- PRIVATEで`python3 scripts/package-npc-images.py --pack <packId> --output /tmp/<packId>.zip`を実行する。
- ゲームの「登場人物の画像・大きさ」から**そのパックだけ**登録する。
- 既存9枚は再登録不要。画像は端末内のIndexedDBに保持される。
- 現行ZIPはPNGの4列×2行、8コマを基本とする。別レイアウトは仕様確定時に拡張する。

## 保存とナラティブ拡張の境界

現行の初対面・再会状態は`groupId`単位であり、
**同一キャストが別地点にいる場合の大域的な記憶はまだない。**
会話セッションには`castId`を保持するが、その値による物語進行は未実装。
口調ルール、対話相互作用、章・伏線、条件分岐、世界状態については
専用設計スレで仕様を決定する。見切り発車で汎用AI会話エンジンを作らない。

現在の`first/again/normal`と端末内保存キーは後方互換で保持する。
原作に関わる画像・会話の使用範囲は、公開前に確認する。
