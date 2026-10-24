# 実装に基づくUI棚卸し

固定対象 PUBLIC #16 e64806c。分類は将来の対応方針。本タスクで本番UIの削除・変更を実施していない。

| 要素・実装位置 | 用途 / 表示条件 | 入力 | 問題 | 分類 / 対応 |
|---|---|---|---|---|
| index.html .brand | 常設タイトル | なし | HUD高さを消費 | REMOVE / タイトルは起動・メニューへ |
| #mode / main.js changeMode | 全体地図の開閉 / 常設 | クリック、M/X、pad X | 暗色ツールバー依存 | KEEP_REDESIGN / 手帳地図アイコン、展開状態 |
| #reset / main.js onclick | 開始位置へ戻る / 歩行中 | クリック | デバッグ的常設 | DEBUG_ONLY / 通常DOMにマウントしない |
| #roads | 道路表示切替 / 歩行中 | クリック | プレイヤー用途でない | DEBUG_ONLY |
| #buildings | 建物表示切替 / 歩行中 | クリック | 同上 | DEBUG_ONLY |
| #scene aria-label | 3D表示領域 / 常設 | ドラッグ・ホイール・タッチ | 視覚的要素ではない | KEEP_FUNCTIONAL / 地名なしのアクセシブル名を維持 |
| #status 初期・準備 | データ取得中のみ | なし | 内部のタイル数を露出 | KEEP_REDESIGN / 短い進捗と静止記号 |
| #status.failed | 取得失敗・開始地点失敗 | 現状操作なし | 技術例外文字列が画面に出る | KEEP_FUNCTIONAL / 短い文・安全な再試行UIを共通化、内部詳細は公開しない |
| #details | 道路・建物等統計 / CSSで非表示 | なし | 生成処理が残存 | DEBUG_ONLY / 通常DOMから除外 |
| #player-coords | 位置 / 空文字＋CSS非表示 | なし | 非表示実装が重複 | DEBUG_ONLY / 機密の新規公開経路を作らない |
| .compass | 北向き / 常設 | なし | 固定N↑でカメラと不整合 | KEEP_REDESIGN / カメラ基準回転 |
| #joystick / knob | タッチ移動 / coarse・歩行中 | pointer capture | 大きい高コントラスト円、UI系統違い | KEEP_REDESIGN / 紙とインクの輪郭、116px |
| #run / .holding | 押している間走る / coarse・歩行中 | pointerdown/up/cancel | ボタン外観が独立 | KEEP_REDESIGN / 68px、押下中のみ深緑 |
| footer #hint | 操作説明 / 現在は空＋非表示 | なし | 残存コンテナ | REMOVE |
| footer 架空データ注記 | サンプルの説明 / 常設 | なし | 探索領域を削る | REMOVE / 必須出典はメニュー内で維持。独立案には案外に注記 |
| #character-switch | 猫うさぎ切替 / spriteあり・walk | click、C/Y、pad Y | 文字と矢印だけ、選択中が分かりにくい | KEEP_REDESIGN / 共通輪郭の2選択、L猫/Rうさぎ、keyboard C互換 |
| #explore-pickup | 近い宝物を拾う / nearest・walk | click、E、pad A | 物名＋文章、対象の強調不足 | KEEP_REDESIGN / 手アイコン、最寄り1対象の輪郭 |
| .poi-layer / marker | 地点提示 / 可視性選別 | 直接操作なし | 旧SVGとKenney画像が混在 | KEEP_REDESIGN / 全地点を同一インク線画へ |
| .poi-name | 地点名 / 距離等条件 | なし | 暗色と紙色が混在 | KEEP_REDESIGN / 近距離または選択中のみ |
| .poi-marker.discovering | 発見 / 1.6s | 自動 | 強い発光と拡大輪 | KEEP_REDESIGN / 650msの1回線輪 |
| .poi-marker.warp-open | ワープ可能状態 | 自動 | 常設発光だけで意味を区別 | KEEP_REDESIGN / 深緑輪＋小さい旗、発光なし |
| #exploration-map | 地図パネル / map | 開閉 | 太い枠、余白と操作が未整理 | KEEP_REDESIGN / 共通紙面と固定操作帯 |
| map canvas 基図 | 北固定2D地図 / map | pointer、左stick、WASD/矢印 | 拡大縮小・panなし | KEEP_REDESIGN / 共通変換とズーム1〜4 |
| map canvas 雲 | 未探索範囲 / map | 自動 | 基図と座標一貫性が後続変更で必要 | KEEP_FUNCTIONAL / 雲を基図と同変換 |
| map canvas 地点アイコン | 発見済み地点 / map | click・A/Enter | 画像と代替四角が異系統 | KEEP_REDESIGN / 統一線画、未発見を露出しない |
| map canvas 現在地 | プレイヤー位置 | 自動 | 色頼みの点 | KEEP_REDESIGN / 錆色点＋方向くさび＋白縁 |
| map canvas cursor | 地点選択 / map | stick・キー・pointer | 常設照準がタッチにも出る | KEEP_REDESIGN / pad/keyboardのみ、focusと区別 |
| map canvas N↑ | 地図北の表示 | なし | 文字だけ | KEEP_REDESIGN / 地図では固定北、探索コンパスとは別 |
| map canvas 500m | 縮尺 | なし | 固定ラベル | KEEP_REDESIGN / zoomと実幅から計算 |
| #map-selection | 選択地点名 / 選択あり、aria-live | 自動 | #map-warpとの上下関係が不統一 | KEEP_REDESIGN / 選択カード |
| #map-warp / busy | ワープ確定 / 開放地点のみ | click、再選択A | 連続入力・地図選択との誤認リスク | KEEP_REDESIGN / 別の明示確定、busy無効化 |
| map failure() | ワープ失敗 | なし | 出力文のみ | KEEP_FUNCTIONAL / 地点維持・失敗記号＋短文 |
| #scene.warp-transition | ワープ遷移 / busy | なし | opacity変化だけ | KEEP_REDESIGN / 短い紙色フェード、reduced対応 |
| biome-debug select/pre/点群 | 分類・候補・除外監査 / test+biomes=1 | select | 公開ビルドのdebug経路要監査 | DEBUG_ONLY / 配信物に監査datasetを追加しない |
| __michiDebug・dataset統計 | テスト計測 / 実装条件による | console/API | UI外だが境界管理が必要 | DEBUG_ONLY / 既存保護維持、座標取得経路を増やさない |
| sound.js | 発見・採集・ワープ等のSE、BGM | 操作時有効化 | 新しい音量UIを別系統にしない | KEEP_FUNCTIONAL / DreamCore共有設定継承 |
| 設定・メニュー | 現行エンジンに固有UIなし | 親画面が音量等を担当 | 親子二重表示の恐れ | KEEP_REDESIGN / 独立時のみ共通パネル、埋込は親へ委譲 |

src/*.js のDOM生成・文字更新を横断検索し、index/styleと照合。wide-overviewのcanvasは描画面で独立プレイヤーUIなし。landmark-fxの3D表現、player-sprite、wildlife等のモデルは統一対象外。ただし操作可能表示を加える際は共通効果仕様に従う。新設の＋/−、フォーカス、loading/error/settings状態はdesign-system/handoffへ記載。
