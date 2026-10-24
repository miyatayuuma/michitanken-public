# MT-07E 実装引継ぎ・受入基準

実装着手はユーザーの画面案確認後。現状視覚受入PENDING。仕様・案のみ、ゲーム動作のPASSではない。

## 入力仕様

| 状態 | pad | keyboard | touch/mouse |
|---|---|---|---|
| 探索 | 左stick移動、右stick視点 | WASD/矢印、drag視点 | 左stick、field drag |
| ダッシュ | L3 rising edge toggle | Shift hold | 走るhold |
| キャラ | L猫・Rうさぎの直接選択 | Cで従来切替、Y互換は既存用途確認後に文言と統合 | 2アイコン直接選択 |
| 地図 | X開閉 | M/X開閉 | 地図/閉じる |
| 決定・採集 | A | E採集、地図Enter | 採集アイコン/ここへいく |
| 戻る | B | Escape | 閉じる、選択解除は空白タップ |
| 地図zoom | L縮小/R拡大、押下毎1段 | ホイール、＋/− | ピンチ、＋/− |
| 地図pan | 左stick | WASD/矢印・drag | 1指drag |

ZRダッシュとYキャラの**pad割当**を解除。L/Rは地図中にキャラへ漏らさない。L3保持で繰返し切替しない。移動停止でもON維持、地図開始・ワープ開始/終了・再開・blur・切断・親release-allでOFF。再接続はneutral再armまで受理しない。Shift/走るは独立hold。画面遷移時は全入力を解放。pad glyphはstandard mapping論理名を使用し、GC201実機の物理印字と一致確認を必須にする。

## 地図・コンパス

地図はnorth-up。zoom z∈[1,4]、ボタン/padは1段、pinch/wheelは連続値。共通変換 S = center + z*(base(P)-center) + pan を基図・雲・地点・現在地に適用し、hit testは逆変換。pinch中心/マウス位置をzoomアンカーにする。panは地図外が過剰に露出しない範囲へclamp。ピンチ中およびdrag移動8px以上で選択/warpを発火しない。選択後は明示確定を別edgeで受理し、同じ押下で選択と実行を兼ねない。新しい選択/移動操作で古い確定を無効にする。

縮尺は実世界幅W、等倍地図描画幅s、バー幅bから表示距離=b*W/(s*z)。1/2/5系に丸めた距離へバー長を合わせる。固定500m文字は禁止。1/2/4倍・端部・resize・DPR1/2で地点とhit testを照合。

探索コンパス: camera.getWorldDirectionのXZ投影から方位を計算。画面上の北ベクトルはカメラ方位の逆回転。視線が真上/真下でXZが小さい場合は直前有効方位を維持。北を見る=N上、東を見る=N左、南=N下、西=N右。キャラだけ回しても変わらず、カメラだけ回せば変わることを自動テストする。地図Nは固定で別制御。

## 実装順と検証ゲート

1. 最新4レポ・全open PRを再監査。#16累積版を保護、今回のdocs-only PRを先にmergeする必要はない。
2. 共通token/icon/panel/stateを導入し、audit全行の対応を追跡。通常DOMからdebug UI撤去、配信物の監査dataset非混入を検証。
3. 入力modeを分離、pad edge/hold/blur/parent relayのテスト。Aを親relayと子pollで二重実行しない。Bは選択解除→地図閉じる、親の戻るへ勝手に伝播しない。
4. 地図座標変換とcompassの決定的テスト。pan・zoom中の誤ワープ0、未発見・未開放は選択不能/実行不可。
5. 採集: nearest有効宝物1個だけ、距離外/動物/遮蔽/既採集を誤強調しない。採集成否・保存・再開・重複入力を検証。
6. 6必須画面＋loading/error/menu/busy/disabled/focus、PC/縦/横/safe-area/200%文字/低負荷/reduced-motionで画像照合。タップ44px、通常HUD中央被覆なし。
7. PRIVATE組立はローカル受入、[skip ci]、PRIVATE Actions起動0。実地理・絵・素材をPUBLICのログ/画像へ出さない。
8. DreamCore親付きで全8作品、戻る、音声、PWA、pad再開と二重UIを検証。単独プレビューの結果で代替しない。
9. ユーザー実機（スマホ・GC201）の視覚/操作受入は別記録。本番デプロイはユーザーのみ、並列4の既定を維持。

## 本タスクの実装限界

HTMLは状態を選んで見るUI試作。zoomは架空SVG倍率切替、選択・ワープ/採集成功は模擬。真の地図pan/pinch、ゲームpad、L3、カメラ連動、3D採集輪、音声同期、保存、親frame連携は未実装。実装済みと扱わない。ユーザーに見せるのは完成ゲームの品質保証ではなく、配置・形・色・状態の具体案。
