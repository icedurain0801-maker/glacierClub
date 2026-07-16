const assert = require('assert');
const liveTools = require('../src/services/liveTools');

function main() {
  assert.strictEqual(liveTools.isWeatherQuery('\u4eca\u5929\u5929\u6c14\u600e\u4e48\u6837'), true);
  assert.strictEqual(liveTools.isWeatherQuery('\u5317\u4eac\u4f1a\u4e0d\u4f1a\u4e0b\u96e8'), true);
  assert.strictEqual(liveTools.isWeatherQuery('\u5149\u660e\u533a\u5468\u516d\u4f1a\u4e0b\u96e8\u5417'), true);
  assert.strictEqual(liveTools.isWeatherQuery('\u4e0a\u6d77\u660e\u5929\u4e0b\u4e0d\u4e0b\u96e8'), true);
  assert.strictEqual(liveTools.isWeatherQuery('\u4f60\u597d'), false);

  assert.strictEqual(liveTools.extractWeatherLocation('\u4e0a\u6d77\u4eca\u5929\u5929\u6c14\u600e\u4e48\u6837'), '\u4e0a\u6d77');
  assert.strictEqual(liveTools.extractWeatherLocation('\u5e2e\u6211\u67e5\u4e0b\u5317\u4eac\u660e\u5929\u5929\u6c14'), '\u5317\u4eac');
  assert.strictEqual(liveTools.extractWeatherLocation('\u6df1\u5733\u5468\u516d\u5929\u6c14\u600e\u4e48\u6837'), '\u6df1\u5733');
  assert.strictEqual(liveTools.extractWeatherLocation('\u6df1\u5733\u5468\u516d\u5149\u660e\u533a\u5929\u6c14'), '\u6df1\u5733\u5149\u660e\u533a');
  assert.strictEqual(liveTools.extractWeatherLocation('\u5468\u516d\u6df1\u5733\u5149\u660e\u533a\u5929\u6c14'), '\u6df1\u5733\u5149\u660e\u533a');
  assert.strictEqual(liveTools.extractWeatherLocation('\u5317\u4eac\u660e\u5929\u671d\u9633\u533a\u4f1a\u4e0d\u4f1a\u4e0b\u96e8'), '\u5317\u4eac\u671d\u9633\u533a');
  assert.strictEqual(liveTools.extractWeatherLocation('\u5149\u660e\u533a\u5468\u516d\u4f1a\u4e0d\u4f1a\u4e0b\u96e8'), '\u5149\u660e\u533a');
  assert.strictEqual(liveTools.extractWeatherLocation('\u5149\u660e\u533a\u5468\u516d\u4f1a\u4e0b\u96e8\u5417'), '\u5149\u660e\u533a');
  assert.strictEqual(liveTools.extractWeatherLocation('\u4e0a\u6d77\u660e\u5929\u4e0b\u4e0d\u4e0b\u96e8'), '\u4e0a\u6d77');
  assert.strictEqual(liveTools.extractWeatherLocation('weather in Tokyo'), 'Tokyo');
  assert.strictEqual(liveTools.extractWeatherLocation('\u4eca\u5929\u5929\u6c14\u600e\u4e48\u6837'), '');
  assert.strictEqual(liveTools.extractWeatherLocation('\u540e\u5929\u4f1a\u4e0b\u96e8\u5417'), '');
  assert.strictEqual(liveTools.extractWeatherLocation('\u90a3\u540e\u5929\u4f1a\u4e0b\u96e8\u5417'), '');
  assert.strictEqual(liveTools.extractWeatherLocation('\u59da\u660e\u662f\u8c01'), '');
  assert.strictEqual(
    liveTools.detectWeatherDayOffset('\u5468\u516d\u5462', new Date('2026-07-15T12:00:00+08:00')),
    3
  );
  assert.strictEqual(
    liveTools.detectWeatherDayOffset('\u4e0b\u5468\u4e00\u5929\u6c14', new Date('2026-07-15T12:00:00+08:00')),
    5
  );
  assert.strictEqual(liveTools.isWeatherFollowupQuery('\u5468\u516d\u5462'), true);
  assert.strictEqual(liveTools.isWeatherFollowupQuery('\u591a\u5c11\u94b1'), false);

  assert.strictEqual(liveTools.isInformationalQuery('\u5149\u660e\u533a\u5468\u516d\u4f1a\u4e0b\u96e8\u5417'), true);
  assert.strictEqual(liveTools.isInformationalQuery('OpenAI \u6700\u65b0\u53d1\u5e03\u4e86\u4ec0\u4e48'), true);
  assert.strictEqual(liveTools.isInformationalQuery('\u4f60\u597d\u5440'), false);
  assert.strictEqual(liveTools.isStandaloneSearchTopic('\u9a6c\u65af\u514b'), true);
  assert.strictEqual(liveTools.isStandaloneSearchTopic('OpenAI o3'), true);
  assert.strictEqual(liveTools.isStandaloneSearchTopic('\u8fd9\u4e2a'), false);

  assert.strictEqual(liveTools.shouldUseWebSearch('OpenAI\u6700\u65b0\u65b0\u95fb', { ragRefs: [], facts: [] }), true);
  assert.strictEqual(liveTools.shouldUseWebSearch('\u5e2e\u6211\u641c\u4e00\u4e0bOpenAI\u6700\u65b0\u65b0\u95fb', { ragRefs: [], facts: [] }), true);
  assert.strictEqual(liveTools.shouldUseWebSearch('\u4eca\u5929\u9ec4\u91d1\u4ef7\u683c\u662f\u591a\u5c11', { ragRefs: [], facts: [] }), true);
  assert.strictEqual(liveTools.shouldUseWebSearch('\u4e16\u754c\u676f\u51b3\u8d5b\u4ec0\u4e48\u65f6\u5019', { ragRefs: [], facts: [] }), true);
  assert.strictEqual(liveTools.shouldUseWebSearch('\u9a6c\u65af\u514b', { ragRefs: [], facts: [] }), true);
  assert.strictEqual(liveTools.isEventRealtimeQuery('\u4e16\u754c\u676f\u51b3\u8d5b\u662f\u8c01\u5bf9\u8c01'), true);
  assert.strictEqual(liveTools.isEventMatchupQuery('\u4e16\u754c\u676f\u51b3\u8d5b\u662f\u8c01\u5bf9\u8c01'), true);
  assert.strictEqual(liveTools.shouldUseWebSearch('\u4e16\u754c\u676f\u51b3\u8d5b\u4ec0\u4e48\u65f6\u5019', {
    ragRefs: [{ entryId: 2, score: 0.6, snippet: '\u65e7\u8d44\u6599', images: [] }],
    facts: [{ subject: '\u4e16\u754c\u676f', predicate: '\u76f8\u5173', object: '\u65e7\u4fe1\u606f' }],
  }), true);
  assert.strictEqual(liveTools.shouldUseWebSearch('\u5149\u660e\u533a\u5468\u516d\u4f1a\u4e0b\u96e8\u5417', { ragRefs: [], facts: [] }), false);
  assert.strictEqual(liveTools.shouldUseWebSearch('\u4f60\u597d', { ragRefs: [], facts: [] }), false);
  assert.strictEqual(liveTools.shouldUseWebSearch('\u5361\u897f\u8fea\u6280\u80fd\u662f\u4ec0\u4e48', {
    ragRefs: [{ entryId: 1, score: 0.6, snippet: '\u6280\u80fd\u8bf4\u660e', images: [] }],
    facts: [],
  }), false);
  assert.strictEqual(
    liveTools.buildWebSearchQuery('\u4e16\u754c\u676f\u51b3\u8d5b\u4ec0\u4e48\u65f6\u5019', new Date('2026-07-16T12:00:00+08:00')),
    '2026 \u4e16\u754c\u676f\u51b3\u8d5b\u4ec0\u4e48\u65f6\u5019'
  );
  assert.strictEqual(
    liveTools.buildWebSearchQuery('2022\u4e16\u754c\u676f\u51b3\u8d5b\u4ec0\u4e48\u65f6\u5019', new Date('2026-07-16T12:00:00+08:00')),
    '2022\u4e16\u754c\u676f\u51b3\u8d5b\u4ec0\u4e48\u65f6\u5019'
  );
  assert.deepStrictEqual(
    liveTools.buildWebSearchQueries('\u4e16\u754c\u676f\u51b3\u8d5b\u662f\u8c01\u5bf9\u8c01', new Date('2026-07-16T12:00:00+08:00')),
    [
      '2026 FIFA World Cup finalists',
      '2026 \u4e16\u754c\u676f\u51b3\u8d5b\u662f\u8c01\u5bf9\u8c01',
      '2026 \u4e16\u754c\u676f\u51b3\u8d5b \u5bf9\u9635',
    ]
  );

  assert.deepStrictEqual(
    liveTools.filterReliableEventResults('2026 \u4e16\u754c\u676f\u51b3\u8d5b\u4ec0\u4e48\u65f6\u5019', [
      {
        title: '2026\u4e16\u754c\u676f\u5f00\u5e55\u65f6\u95f4\u4e0e\u8d5b\u7a0b\u5168\u9762\u89e3\u6790',
        url: 'https://example.com/noise',
        source: 'https://www.sohu.com/a...',
        time: '',
        snippet: '\u51b3\u8d5b\u5b9a\u4e8e2026\u5e747\u67088\u65e5\u4e3e\u884c',
      },
      {
        title: '\u56fd\u9645\u8db3\u8054\uff1a2026\u5e74\u4e16\u754c\u676f\u6bd4\u8d5b\u51b3\u8d5b\u5c06\u5728\u7f8e\u56fd\u7ebd\u7ea6\u4e3e\u884c',
        url: 'https://example.com/thepaper',
        source: 'https://www.thepaper.cn/n...',
        time: '',
        snippet: '\u51b3\u8d5b\u5c06\u4e8e2026\u5e747\u670819\u65e5\u4e3e\u884c',
      },
    ]).map(item => item.source),
    ['https://www.thepaper.cn/n...']
  );
  assert.deepStrictEqual(
    liveTools.filterReliableEventResults('2026 \u4e16\u754c\u676f\u51b3\u8d5b\u662f\u8c01\u5bf9\u8c01', [
      {
        title: 'FIFA World Cup 2026 Final: Schedule, Teams, Venue & Results',
        url: 'https://worldcuppass.com/world-cup-2026-final/',
        source: 'worldcuppass.com',
        time: '',
        snippet: 'FIFA World Cup 2026 Final: Spain face England or Argentina on July 19 at MetLife Stadium.',
      },
      {
        title: '2026\u5e74\u516c\u773e\u5047\u671f',
        url: 'https://www.gov.hk/tc/about/abouthk/holiday/2026.htm',
        source: 'gov.hk',
        time: '',
        snippet: '\u9999\u6e2f2026\u5e74\u516c\u4f17\u5047\u671f\u4e00\u89c8',
      },
    ]).map(item => item.source),
    ['worldcuppass.com']
  );

  assert.strictEqual(liveTools.weatherCodeToText(61), '\u5c0f\u96e8');

  const sampleHtml = `
    <div class="vrwrap">
      <h3 class="vr-title"><a href="/link?url=abc">OpenAI | Research &amp; Deployment</a></h3>
      <div class="fz-mid space-txt base-ellipsis clamp2">OpenAI \u53d1\u5e03\u4e86\u65b0\u6a21\u578b\u3002</div>
      <a class="citeLinkClass"><span>https://openai.com/</span><span>16\u5c0f\u65f6\u524d</span></a>
    </div>
    <div class="vrwrap">
      <h3 class="vr-title"><a href="/link?url=def">\u7b2c\u4e8c\u6761\u7ed3\u679c</a></h3>
      <div class="fz-mid">\u7b2c\u4e8c\u6761\u6458\u8981</div>
      <a class="citeLinkClass"><span>https://example.com/</span></a>
    </div>
  `;
  const results = liveTools.parseSogouSearchResults(sampleHtml, 5);
  assert.deepStrictEqual(results.map(item => item.title), [
    'OpenAI | Research & Deployment',
    '\u7b2c\u4e8c\u6761\u7ed3\u679c',
  ]);
  assert.strictEqual(results[0].source, 'https://openai.com/');
  assert.strictEqual(results[0].time, '16\u5c0f\u65f6\u524d');
  assert.strictEqual(results[0].snippet, 'OpenAI \u53d1\u5e03\u4e86\u65b0\u6a21\u578b\u3002');

  const sampleRss = `
    <rss><channel>
      <item>
        <title>OpenAI News</title>
        <link>https://openai.com/news</link>
        <description>Latest announcements from OpenAI.</description>
        <pubDate>Thu, 16 Jul 2026 01:00:00 GMT</pubDate>
      </item>
      <item>
        <title>OpenAI News</title>
        <link>https://openai.com/news</link>
        <description>Latest announcements from OpenAI.</description>
        <pubDate>Thu, 16 Jul 2026 01:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;
  const rssResults = liveTools.parseBingRssResults(sampleRss, 5);
  assert.deepStrictEqual(rssResults, [
    {
      title: 'OpenAI News',
      url: 'https://openai.com/news',
      source: 'openai.com',
      time: 'Thu, 16 Jul 2026 01:00:00 GMT',
      snippet: 'Latest announcements from OpenAI.',
    },
  ]);

  const sampleBingHtml = `
    <ol id="b_results">
      <li class="b_algo">
        <h2><a href="https://www.bing.com/ck/a?u=a1aHR0cHM6Ly93b3JsZGN1cHBhc3MuY29tL3dvcmxkLWN1cC0yMDI2LWZpbmFsLw">FIFA World Cup 2026 Final: Schedule, Teams, Venue &amp; Results</a></h2>
        <div class="b_caption"><p>FIFA World Cup 2026 Final: Spain face England or Argentina on July 19.</p></div>
        <div class="b_attribution"><cite>https://worldcuppass.com/world-cup-2026-final/</cite></div>
      </li>
    </ol>
  `;
  assert.deepStrictEqual(liveTools.parseBingHtmlResults(sampleBingHtml, 5), [
    {
      title: 'FIFA World Cup 2026 Final: Schedule, Teams, Venue & Results',
      url: 'https://worldcuppass.com/world-cup-2026-final/',
      source: 'https://worldcuppass.com/world-cup-2026-final/',
      time: '',
      snippet: 'FIFA World Cup 2026 Final: Spain face England or Argentina on July 19.',
    },
  ]);

  const relevantWeatherResults = liveTools.filterRelevantSearchResults('\u5149\u660e\u533a \u5468\u516d \u5929\u6c14', [
    {
      title: '\u5149\u660e\u533a\u5468\u516d\u5929\u6c14',
      url: 'https://example.com/weather',
      source: 'example.com',
      time: '',
      snippet: '\u9635\u96e8\u8f6c\u5c0f\u96e8\uff0c\u6709\u964d\u96e8\u53ef\u80fd',
    },
    {
      title: 'zx\u662f\u4ec0\u4e48\u610f\u601d',
      url: 'https://example.com/noise',
      source: 'example.com',
      time: '',
      snippet: '\u7f51\u7edc\u7528\u8bed\u89e3\u91ca',
    },
  ]);
  assert.deepStrictEqual(relevantWeatherResults.map(item => item.title), [
    '\u5149\u660e\u533a\u5468\u516d\u5929\u6c14',
  ]);

  const relevantNewsResults = liveTools.filterRelevantSearchResults('OpenAI\u6700\u65b0\u65b0\u95fb', [
    {
      title: 'OpenAI \u6b63\u5728\u5f00\u53d1\u65b0\u786c\u4ef6',
      url: 'https://example.com/openai-news',
      source: 'example.com',
      time: '',
      snippet: '\u8fd9\u662f OpenAI \u7684\u6700\u65b0\u52a8\u6001',
    },
    {
      title: '\u5b8c\u5168\u4e0d\u76f8\u5173\u7684\u6761\u76ee',
      url: 'https://example.com/other',
      source: 'example.com',
      time: '',
      snippet: '\u8fd9\u662f\u53e6\u4e00\u4e2a\u65e0\u5173\u8bdd\u9898',
    },
  ]);
  assert.deepStrictEqual(relevantNewsResults.map(item => item.title), [
    'OpenAI \u6b63\u5728\u5f00\u53d1\u65b0\u786c\u4ef6',
  ]);

  const weatherFallbackReply = liveTools.buildWeatherSearchFallbackReply('\u5149\u660e\u533a \u5468\u516d \u5929\u6c14', [
    {
      title: '\u5149\u660e\u533a\u5929\u6c14\u9884\u62a5',
      url: 'https://example.com/weather',
      source: 'example.com',
      time: '',
      snippet: '\u9635\u96e8\u8f6c\u5c0f\u96e8\uff0c\u6709\u964d\u96e8\u53ef\u80fd',
    },
  ]);
  assert.strictEqual(
    weatherFallbackReply,
    '\u5149\u660e\u533a\u5468\u516d\u503e\u5411\u4e8e\u6709\u96e8\uff0c\u51fa\u95e8\u5efa\u8bae\u5e26\u4f1e\u3002'
  );

  const naturalWeatherFallbackReply = liveTools.buildWeatherSearchFallbackReply('\u5149\u660e\u533a\u5468\u516d\u4f1a\u4e0b\u96e8\u5417', [
    {
      title: '\u5149\u660e\u533a\u5468\u516d\u5929\u6c14',
      url: 'https://example.com/weather-2',
      source: 'example.com',
      time: '',
      snippet: '\u9635\u96e8\u8f6c\u5c0f\u96e8\uff0c\u6709\u964d\u96e8\u53ef\u80fd',
    },
  ]);
  assert.strictEqual(
    naturalWeatherFallbackReply,
    '\u5149\u660e\u533a\u5468\u516d\u503e\u5411\u4e8e\u6709\u96e8\uff0c\u51fa\u95e8\u5efa\u8bae\u5e26\u4f1e\u3002'
  );

  assert.deepStrictEqual(
    liveTools.filterRelevantSearchResults('\u5149\u660e\u533a \u5468\u516d \u5929\u6c14', [
      {
        title: '\u6df1\u5733\u5149\u660e\u5929\u6c14',
        url: 'https://example.com/shenzhen-guangming-weather',
        source: 'example.com',
        time: '',
        snippet: '\u5468\u516d\u6709\u9635\u96e8',
      },
      {
        title: '\u5e7f\u660e\u65b0\u95fb',
        url: 'https://example.com/other',
        source: 'example.com',
        time: '',
        snippet: '\u65e0\u5173\u5185\u5bb9',
      },
    ]).map(item => item.title),
    ['\u6df1\u5733\u5149\u660e\u5929\u6c14']
  );

  console.log('liveTools tests passed');
}

main();
