const payload = {
  botId: process.env.BOT_ID || 'bot-service',
  userId: `codex-${Date.now()}`,
  message: '薇珀有哪些技能',
  messages: []
};

(async () => {
  const response = await fetch(`${process.env.API_BASE || 'http://localhost:3100/api'}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    throw new Error(`Chat failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let meta = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      const line = block.split('\n').find((item) => item.startsWith('data: '));
      if (!line) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === 'meta') meta = event;
      if (event.type === 'delta') answer += event.text;
    }
  }

  console.log(JSON.stringify({ answer, visuals: meta?.visuals || [] }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
