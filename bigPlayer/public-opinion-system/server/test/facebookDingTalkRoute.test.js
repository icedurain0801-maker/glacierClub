const test = require('node:test'), assert = require('node:assert/strict');
const { BaasDingTalk } = require('../src/services/baasDingTalk');
test('Facebook custom group overrides only Facebook and inheritance preserves BigPlayer route', async () => {
  let config = { communityRoutes: { 'g:c': { robot: 'bigplayer', enabled: true, pushTypes: ['urgent'] } } };
  const service = new BaasDingTalk({ repo: { query: async () => [{ game_id: 'g', community_id: 'c', platform: 'facebook' }] } });
  service.read = async () => config; service.change = async fn => { config = await fn(config); }; service.token = () => 'fake'; service.robots = async () => [{ alias:'bigplayer' },{ alias:'fb' }]; service.status = async () => ({authorized:true});
  assert.equal((await service.routes('source','fake')).mode,'inherit');
  await service.saveRoute('source','fake',{mode:'custom',robot:'fb',enabled:true,pushTypes:['urgent','quality']});
  assert.equal(config.communityRoutes['g:c'].robot,'bigplayer'); assert.equal(config.sourceRoutes.source.robot,'fb');
  assert.equal((await service.routes('source','fake')).mode,'custom');
  await service.saveRoute('source','fake',{mode:'inherit',robot:'',enabled:false,pushTypes:['urgent']});
  assert.equal(config.sourceRoutes.source,undefined); assert.equal(config.communityRoutes['g:c'].robot,'bigplayer');
});
