import assert from 'node:assert/strict';
import {spansToUtf16} from './public/js/span-offsets.mjs';
const answer='😀 예산은 9억원입니다.';
const [span]=spansToUtf16(answer,[{start:6,end:9,quote:'9억원'}]);
assert.equal(answer.slice(span.start,span.end),'9억원');
assert.deepEqual(spansToUtf16(answer,[{start:-1,end:2},{start:1,end:999},{start:1.5,end:3}]),[]);
console.log('Unicode highlight offsets and invalid span checks passed');
