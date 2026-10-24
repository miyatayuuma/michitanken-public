# MT-07E-0 — 手描きの探検手帳

状態: 仕様・独立プレビュー準備。**視覚受入 PENDING**。本番実装へ自動進行しない。

[独立プレビュー](preview.html)をダウンロードしてブラウザで開く。ネットワーク不要、外部依存・実地理・原画なし。9状態×PC/スマホ/横画面の画像は[screens](screens)。これは最終ゲームのスクリーンショットではなくUI合成案。

## 正本と開始監査（2026-10-25 JST）

| Repo | main | 参照PR / HEAD | 状態 |
|---|---|---|---|
| michitanken-public | 42f9c1d6ec4050219a1bf8c79e183f0ac6f9c86d | #16 e64806cbd2222897cc3f444cc6f405d4fd8122aa | Draft/open、testとfictional-mobile-browser成功 |
| michitanken | 6803fa0ee8272824adce231735d3a2480729518c | #26 b420ebe77951c1a908796c8105a2ff7470a16da5 | Draft/open、check-runs 0 |
| dreamcore-games | 065cb1dcf49e9bfd1eb935f5e4b554d1367b7a43 | #34 c29a4014b5838356fa8a066b0bbd973ccf82a6f7 | Draft/open、check-runs 0 |
| dreamcore-games-public | a79acb29f6c17fc612220e99faca2c5cf099c897 | #9 5f61b1aed6fb52be0c66bbe2212aba157f75ae7b | Draft/open |

PUBLIC並行PR #8〜16、PRIVATE #19〜26、DreamCore #31〜34がopen。mainは配信済みMT-07Dを含まないため、#16 HEADから独立ブランチを作る。既存PRの編集・マージ・クローズなし。監査対象はmainの旧UIだけでなく#16の累積実装。ユーザー報告の本番デプロイ完了は受領情報であり、ここでは本番の一致確認を実施していない。

## 参考の採否

- [A Short Hike公式作者ページ](https://adamgryu.itch.io/a-short-hike): 自由探索を妨げない控えめなUIを設計上の参考にする。ピクセル表現・既存アイコン・文字配置をコピーしない。
- [Alba公式](https://www.albawildlife.com/): 自然探索の親しみやすさを参考にする。撮影機能・収集リスト・作品固有のパネルを導入しない。
- [Lil Gator Game公式](https://www.playtonicgames.com/game/lil-gator-game/): 遊び心のある冒険表現を参考にする。キャラ・段ボール素材・既存UIを流用しない。

以上は本作の設計上の解釈。比較作品の操作仕様を検証したという主張ではない。参照ページ調査日2026-10-25。

## 成果物

- [全UI監査](audit.md)
- [デザインシステム・素材・効果](design-system.md)
- [後続実装と受入基準](handoff.md)
- [独立HTML](preview.html)
- [機械的表示検証](qa.json)
- [セルフレビュー](review.md)
