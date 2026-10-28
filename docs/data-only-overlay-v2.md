# PUBLIC runtime + PRIVATE data-only overlay（schemaVersion 2）

## 不変条件

- PUBLICのみが実行コード、HTML、CSS、runtime package.jsonの正本になる。
- PRIVATEは公開許可済みの runtime JSONと素材のみを供給する。
- PUBLICの架空地理データは本番組み立てに一切含めない。
- PRIVATEの実地理、監査資料、固有素材をPUBLICのGit履歴やCIに送らない。
- 旧v1組み立てを維持し、過去の固定releaseを再現できるようにする。
- PRIVATE Actions、PRマージ、Firebase Hosting自動実行はしない。

## v2 manifest

PRIVATEのproduction-public-sync.json：

```json
{
  "schemaVersion": 2,
  "publicPaths": ["index.html", "src", "lib", "package.json"],
  "privatePaths": ["public/data", "public/assets"],
  "protectedPaths": ["public/data", "public/assets"]
}
```

v2は指定パスを厳密に要求し、PUBLIC/PRIVATE間の重複所有を拒否する。PRIVATEのruntime dataではJSONのみ、assetsではJSON・画像・GLB・音声・出典テキスト等のみを許可する。HTML/JS等の実行コードをPRIVATEから混入させない。

既存のPRIVATE lib/field.mjsにある実地理のCENTERは取得用レガシーコードとして残せるが、組み立てたruntimeには取り込まない。中心座標はPRIVATEのpublic/data/field.jsonおよびtiles.jsonから読み込む。

## 表示設定

PRIVATEのpublic/data/site-config.jsonが必須。schema=1、titleとcredits（テキストおよびHTTPSリンク）だけを許可する。PUBLICのHTMLとDOMは固定し、表示文言・帰属表示だけをJSONから安全なtextContent/DOMノードとして反映する。

PUBLICリポジトリの同名JSONは架空データ専用fixtureであり、PRIVATE組み立てにはコピーされない。v1のHTML・既存の帰属表示は維持される。

## 検証順序

1. PUBLICのnpm test / npm run build（架空データ）。
2. PRIVATE v2 manifestの実データと合わせてnpm run integrated -- --private ... を実行。保護ファイルの全SHA照合。
3. npm run integrated -- --private ... --build でnamed import/API整合を確認。
4. 実地理の25タイル、UI、道路・水面、操作、NPC、アセット・帰属表示をブラウザで確認。
5. DreamCore全8作品・音声・PWA・Hosting差分を検証し、固定SHAリリースを準備。

1〜3は開発用ゲートであり、本番公開の承認ではない。旧v1のリリース用lockと本番配信には触れない。
