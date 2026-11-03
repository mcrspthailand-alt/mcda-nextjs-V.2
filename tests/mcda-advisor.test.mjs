import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeAdvisorStructure, entropyWeights } from '../lib/advisor/mcda.ts';

const structure = {
  objective: 'Choose the strongest option',
  contextSummary: 'Deterministic test fixture',
  alternatives: [
    { id: 'A1', name: 'Option A', description: '' },
    { id: 'A2', name: 'Option B', description: '' },
    { id: 'A3', name: 'Option C', description: '' },
  ],
  groups: [
    { name: 'Performance', description: '', criteriaIds: ['C1', 'C2', 'C3'] },
  ],
  criteria: [
    {
      id: 'C1',
      name: 'Quality',
      group: 'Performance',
      unit: 'score',
      direction: 'benefit',
      values: [90, 70, 50],
      basis: 'user_data',
      confidence: 1,
      measurementNote: 'fixture',
    },
    {
      id: 'C2',
      name: 'Cost',
      group: 'Performance',
      unit: 'THB',
      direction: 'cost',
      values: [10, 20, 30],
      basis: 'user_data',
      confidence: 1,
      measurementNote: 'fixture',
    },
    {
      id: 'C3',
      name: 'Speed',
      group: 'Performance',
      unit: 'score',
      direction: 'benefit',
      values: [9, 6, 4],
      basis: 'user_data',
      confidence: 1,
      measurementNote: 'fixture',
    },
  ],
  caveats: [],
};

test('Entropy weights sum to one', () => {
  const result = entropyWeights(structure);
  const sum = result.weights.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 1) < 1e-10);
  assert.equal(result.weights.length, 3);
  assert.ok(result.weights.every((value) => Number.isFinite(value) && value >= 0));
});

test('Five MCDA advisors return stable rankings and consensus', () => {
  const result = analyzeAdvisorStructure(structure);
  assert.equal(result.advisors.length, 5);
  assert.equal(result.winnerName, 'Option A');
  assert.equal(result.consensus[0].alternativeName, 'Option A');
  assert.ok(result.advisors.every((advisor) => advisor.ranks.length === 3));
  assert.ok(result.advisors.every((advisor) => Number.isFinite(advisor.winnerScore)));
});
