// Stable IDs also key the existing local image store and encounter state.
export const BOOK_GROUPS = [
 {groupId:'king-cat', members:[['king','王さま',1.65],['cat','ねこ',.8]], dialogues:{first:[['王さま','おや、ここにも道があるぞ。'],['ねこ','ええ。足元を見て歩きましょう。']],again:[['王さま','また会ったな。今日はどの道へ行こうか。'],['ねこ','ゆっくり決めればいいですよ。']]}},
 {groupId:'kiki-jiji', members:[['kiki','キキ',1.65],['jiji','ジジ',.7]], dialogues:{first:[['キキ','こんにちは！ この街ではどんな発見があるかしら。'],['ジジ','配達の道も、ちゃんと覚えておかないとね。']],again:[['キキ','また会えたね！ 新しい道を見つけたの。'],['ジジ','今度は迷わず帰れるといいね。']]}},
 {groupId:'skipper', members:[['skipper','スキッパー',1.55]], dialogues:{first:[['スキッパー','あれは何だろう。ちょっと近くで見てみようかな。']],again:[['スキッパー','また会ったね。さっき、気になるものを見つけたんだ。']]}},
 {groupId:'twins', members:[['twin-1','ふたごの一人',1.3],['twin-2','ふたごのもう一人',1.3]], dialogues:{first:[['ふたごの一人','こんにちは！ あっちの道を見てきたよ。'],['ふたごのもう一人','こっちの道にも何かあるかもね。']],again:[['ふたごの一人','また会ったね！'],['ふたごのもう一人','今度はどこを探検しようか。']]}},
 {groupId:'zorori', members:[['zorori','ゾロリ',1.55],['ishishi','イシシ',1.25],['noshishi','ノシシ',1.25]], dialogues:{first:[['ゾロリ','よーし、この街でも冒険を始めるぞ！'],['イシシ','どんな計画だ？'],['ノシシ','おらも楽しみだ！']],again:[['ゾロリ','また会ったな！ 次の作戦を考えていたところだ。'],['イシシ','わくわくするなあ。'],['ノシシ','いっしょに行こう！']]}}
].map(group=>({...group, dialogues:{...group.dialogues, explore:group.dialogues.again}}));
export const BOOK_GROUP_BY_ID = Object.fromEntries(BOOK_GROUPS.map(group=>[group.groupId,group]));
