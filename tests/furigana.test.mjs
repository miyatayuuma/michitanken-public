import test from 'node:test';
import assert from 'node:assert/strict';
import {splitFurigana} from '../lib/furigana.mjs';

test('furigana splits annotated words while keeping punctuation and kana',()=>{
 assert.deepEqual(splitFurigana('道《みち》を歩《ある》こう！'),[
  {base:'道',reading:'みち'},{text:'を'},{base:'歩',reading:'ある'},{text:'こう！'}
 ]);
 assert.deepEqual(splitFurigana('きょうはいい天気'),[{text:'きょうはいい天気'}]);
 assert.deepEqual(splitFurigana('<script>危険</script>'),[{text:'<script>危険</script>'}]);
});
