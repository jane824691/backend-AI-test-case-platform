import { parseJestJson } from './jest-json.parser';

describe('parseJestJson', () => {
  it('extracts TC prefixes and Jest outcomes from assertion results', () => {
    const result = parseJestJson(JSON.stringify({ testResults: [{ name: 'cart.test.ts', assertionResults: [
      { title: '[TC-PET-CART-001] adds an item', status: 'passed', duration: 12 },
      { title: '[TC-PET-CART-002] removes an item', status: 'failed', duration: 4, failureMessages: ['expected cart to be empty'] },
      { title: 'unbound test', status: 'pending' },
    ] }] }));
    expect(result).toEqual([
      expect.objectContaining({ identifier: 'TC-PET-CART-001', outcome: 'passed', durationMs: 12 }),
      expect.objectContaining({ identifier: 'TC-PET-CART-002', outcome: 'failed', failureMessage: 'expected cart to be empty' }),
      expect.objectContaining({ identifier: null, outcome: 'skipped' }),
    ]);
  });
});
