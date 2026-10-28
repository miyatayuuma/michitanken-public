# 道たんけん：開発用の最短ループ（PRIVATE Actions・Firebase不要）

この手順は**既にあるローカルのPUBLIC/PRIVATEチェックアウト**を使い回す。GitHubから毎回cloneせず、DreamCoreやFirebase Hostingには触れない。実地理データ・固有素材はPRIVATEのままで、組み立て結果は一時ディレクトリに出力する。

## 1. 普段のPUBLICコード修正

PUBLICの作業ブランチで実施する。

```bash
npm test
npm run build
```

ここまでのテストは架空データのみを対象にする。PRIVATE実地理との互換性を証明したものではない。

## 2. PRIVATEとの高速な組み立て・保護チェック

Cloud Shell等で一度だけ認証済みのPRIVATEチェックアウトを用意しておく（clone方法や認証情報を公開リポジトリへ保存しない）。

```bash
cd "$HOME/mt6/public"
npm run integrated -- --private "$HOME/mt6/private"
```

このコマンドが行うこと：

- PUBLICのsrc/・lib/とPRIVATEの保護対象を、新規の一時ディレクトリに組み立てる。
- PRIVATEのJSON、モデル等が変更されていないこと、PUBLICコードが一致していることを検証する。
- チェック成功時は一時成果物を削除する。調査用に残す場合は--keepを付ける。
- Git checkoutを更新しない。PRIVATE Actions、PRマージ、DreamCoreへのコピー、Firebase操作は一切行わない。

これは高速な**ファイル境界の確認**であり、関数API・Vite・実地理表示の完全な受入ではない。

## 3. 実地理を使ったビルド検証

PUBLICの変更がある程度まとまったら：

```bash
npm run integrated -- --private "$HOME/mt6/private" --build
```

保護検証後、組み立て先で依存関係を取得してViteを /games/michitanken/ 向けにビルドする。PUBLICと保護されたPRIVATEライブラリのnamed import不一致などは、この段階で検出する。成功時は一時ビルドディレクトリとdist/の場所を表示して保持する。

依存lockが存在しない場合はnpm installを使い、**リリース再現性は保証しない**と表示する。lockがあればnpm ciを使う。

固定したコミットだけで検証したい場合：

```bash
npm run integrated -- \
  --private "$HOME/mt6/private" \
  --public-sha PUBLIC_40_DIGIT_COMMIT \
  --private-sha PRIVATE_40_DIGIT_COMMIT \
  --build
```

実際の40桁SHAに置き換える。両チェックアウトのHEADと作業ツリーの清潔さを検証し、不一致ならコピー前に停止する。通常の編集中はSHA固定オプションを省略できる。

出力先を明示する場合は--out /tmp/NEW_UNCREATED_DIRECTORYを追加する。存在するディレクトリの上書きは拒否する。

## 4. リリース用ゲートは別

integratedでPASSしても次は完了していない。

1. PRIVATE実データの表示・配置・境界・操作のブラウザ受入
2. DreamCoreの既存7ゲーム・ハブ・共通音声・PWAの回帰
3. リリース対象3リポジトリの固定SHAと配信ファイルmanifestの照合
4. Hostingのliveバックアップ、復旧手順、手動デプロイとHTTP確認

これらは公開候補に対して実行する。日常の小さなPUBLIC修正ごとにDreamCore本番全体の照合やバックアップはしない。

Firebase Hosting本番はユーザーがCloud Shellで操作し、FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4を使用する。PRIVATE Actions、PRIVATEへの自動書き込み、PRの自動マージは禁止。

## 次の構造改善

現状のPRIVATE index.html、lib/field.mjs、lib/water-field.mjsは保護された実行コードである。ここがPUBLICのAPI変更を妨げる。次の独立した改善PRでは、PUBLICがHTMLと汎用ライブラリを所有し、PRIVATEはスキーマ検証済みの実地理・アセット・設定のみを提供する方式へ段階的に移す。既存データの移管やPUBLICへの漏出は行わない。
