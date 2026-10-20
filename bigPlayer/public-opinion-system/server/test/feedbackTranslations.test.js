const test = require('node:test'), assert = require('node:assert/strict');
const { FeedbackTranslations } = require('../src/services/feedbackTranslations');
test('batches translations and reuses cached terms across dates and concurrent loads', async () => {
  let calls = 0;
  const translator = { model: 'test', requireConfigured() {}, async callOnce() { calls++; return { choices: [{ message: { content: JSON.stringify({ translations: [{ id: 0, zh: '没错' }, { id: 1, zh: '可爱' }] }) } }] }; } };
  const service = new FeedbackTranslations({ translator, file: 'NUL' });
  service.file = require('node:path').join(__dirname, '../../.tests/2026-10/2026-10-20/feedback-test-' + process.pid + '.json');
  const items = [{ text: '맞말해요', count: 68 }, { text: '귀엽다', count: 29 }];
  const [a, b] = await Promise.all([service.translate(items), service.translate(items)]);
  assert.equal(calls, 1); assert.equal(a[0].translatedText, '没错'); assert.equal(b[1].count, 29);
  require('node:fs').unlinkSync(service.file);
});
test('invalid or failed translations preserve originals and show failure', async () => {
  const service = new FeedbackTranslations({ file: 'NUL', translator: { model: 'test', requireConfigured() {}, async callOnce() { throw Error('down'); } } });
  const result = await service.translate([{ text: '진짜', count: 60 }]);
  assert.equal(result[0].text, '진짜'); assert.equal(result[0].translationStatus, 'failed');
});

test('Chinese semantic labels need no model request and preserve evidence/counts', async () => {
  let calls=0;const service=new FeedbackTranslations({file:'NUL',translator:{model:'test',requireConfigured(){},async callOnce(){calls++;throw Error('must not run');}}});
  const result=await service.translate([{text:'奖励领取',count:7,feedbackIds:['a','b']},{text:'万圣节活动（2026）',count:3}]);
  assert.equal(calls,0);assert.equal(result[0].translatedText,'奖励领取');assert.equal(result[0].count,7);assert.deepEqual(result[0].feedbackIds,['a','b']);assert.equal(result[1].translationStatus,'completed');
  assert.equal(service.cachedText('イベント'),null);assert.equal(service.cachedText('奖励 reward'),null);
});

test('cached reads never wait behind a different pending translation', async () => {
  const service=new FeedbackTranslations({file:'NUL',translator:{model:'test'}});service.cache[service.key('energy')]='能量';
  service.queue=new Promise(()=>{});
  let timer;try{
    const result=await Promise.race([service.translate([{text:'energy',count:2}]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cache head-of-line blocked')),100);})]);
    assert.equal(result[0].translatedText,'能量');
  }finally{clearTimeout(timer);}
});
