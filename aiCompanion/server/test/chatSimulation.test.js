require('dotenv').config();
const assert = require('assert');

const chatSimulation = require('../src/services/chatSimulation');

async function main() {
  let passed = 0;
  const test = async (name, fn) => {
    await fn();
    console.log(`  OK ${name}`);
    passed += 1;
  };

  try {
    await test('sanitizeTurns clamps into range', async () => {
      assert.strictEqual(chatSimulation.sanitizeTurns(0), 1);
      assert.strictEqual(chatSimulation.sanitizeTurns(99), 12);
      assert.strictEqual(chatSimulation.sanitizeTurns('abc'), 4);
    });

    await test('normalizeScenarioKey falls back to default scenario', async () => {
      assert.strictEqual(chatSimulation.normalizeScenarioKey('lineup_building'), 'lineup_building');
      assert.strictEqual(chatSimulation.normalizeScenarioKey('missing_scenario'), 'newbie_guide');
    });

    await test('normalizePromptMode falls back to independent mode', async () => {
      assert.strictEqual(chatSimulation.normalizePromptMode('continuous'), 'continuous');
      assert.strictEqual(chatSimulation.normalizePromptMode('missing_mode'), 'independent');
    });

    await test('buildSimulationPlan returns bounded prompt list', async () => {
      const plan = chatSimulation.buildSimulationPlan({
        scenarioKey: 'mixed_pressure',
        turns: 20,
        customTopic: '测试版本',
        seed: 'seed-a',
      });

      assert.strictEqual(plan.scenarioKey, 'mixed_pressure');
      assert.strictEqual(plan.turns, 12);
      assert.strictEqual(plan.prompts.length, 8);
      assert.ok(plan.prompts[0].includes('测试版本'));
    });

    await test('buildSimulationPlan supports continuous prompt chains', async () => {
      const plan = chatSimulation.buildSimulationPlan({
        scenarioKey: 'lineup_building',
        promptMode: 'continuous',
        turns: 4,
        customTopic: '冰系阵容',
        seed: 'seed-b',
      });

      assert.strictEqual(plan.promptMode, 'continuous');
      assert.strictEqual(plan.promptModeLabel, '连续追问');
      assert.strictEqual(plan.prompts.length, 4);
      assert.ok(plan.prompts[0].includes('冰系阵容'));
      assert.ok(plan.prompts[1].length > 0);
      assert.ok(plan.prompts[2].length > 0);
      assert.ok(plan.prompts[3].length > 0);
    });

    await test('same request with different seeds produces different prompts', async () => {
      const planA = chatSimulation.buildSimulationPlan({
        scenarioKey: 'lineup_building',
        promptMode: 'independent',
        turns: 4,
        customTopic: '冰系阵容',
        seed: 'seed-1',
      });
      const planB = chatSimulation.buildSimulationPlan({
        scenarioKey: 'lineup_building',
        promptMode: 'independent',
        turns: 4,
        customTopic: '冰系阵容',
        seed: 'seed-2',
      });

      assert.strictEqual(planA.prompts.length, 4);
      assert.strictEqual(planB.prompts.length, 4);
      assert.notDeepStrictEqual(planA.prompts, planB.prompts);
      assert.strictEqual(new Set(planA.prompts).size, planA.prompts.length);
      assert.strictEqual(new Set(planB.prompts).size, planB.prompts.length);
    });

    console.log(`\n${passed} tests passed`);
  } catch (err) {
    console.error(`\nFAILED: ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

main();
