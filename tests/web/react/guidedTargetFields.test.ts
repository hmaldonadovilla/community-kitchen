import {
  normalizeGuidedLineFieldId,
  parseGuidedTargetFieldEntries
} from '../../../src/web/react/features/steps/domain/guidedTargetFields';

describe('guided target fields', () => {
  it('normalizes line field ids from grouped and dotted references', () => {
    expect(normalizeGuidedLineFieldId('MEALS', 'MEALS__QUANTITY')).toBe('QUANTITY');
    expect(normalizeGuidedLineFieldId('MEALS', 'MEALS.RECIPE')).toBe('RECIPE');
    expect(normalizeGuidedLineFieldId('MEALS', 'OTHER.STATUS')).toBe('STATUS');
    expect(normalizeGuidedLineFieldId('MEALS', 'NOTE')).toBe('NOTE');
    expect(normalizeGuidedLineFieldId('MEALS', null)).toBe('');
  });

  it('parses array entries with render-as-label metadata and stable order', () => {
    const parsed = parseGuidedTargetFieldEntries('MEALS', [
      'MEALS__QUANTITY',
      { id: 'MEALS.RECIPE', renderAsLabel: true },
      { fieldId: 'OTHER.STATUS' },
      'MEALS__QUANTITY'
    ]);

    expect(parsed.explicit).toBe(true);
    expect(parsed.order).toEqual(['QUANTITY', 'RECIPE', 'STATUS']);
    expect(parsed.allowed ? Array.from(parsed.allowed) : []).toEqual(['QUANTITY', 'RECIPE', 'STATUS']);
    expect(Array.from(parsed.renderAsLabel)).toEqual(['RECIPE']);
  });

  it('parses comma-delimited target fields', () => {
    const parsed = parseGuidedTargetFieldEntries('MEALS', 'MEALS__QUANTITY, MEALS.RECIPE, NOTE');

    expect(parsed.explicit).toBe(true);
    expect(parsed.order).toEqual(['QUANTITY', 'RECIPE', 'NOTE']);
    expect(parsed.allowed?.has('RECIPE')).toBe(true);
    expect(parsed.renderAsLabel.size).toBe(0);
  });

  it('treats absent configuration as implicit all-fields mode', () => {
    const parsed = parseGuidedTargetFieldEntries('MEALS', null);

    expect(parsed.explicit).toBe(false);
    expect(parsed.allowed).toBeNull();
    expect(parsed.order).toEqual([]);
    expect(parsed.renderAsLabel.size).toBe(0);
  });
});
