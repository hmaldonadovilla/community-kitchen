import { QuestionConfig } from '../../src/types';
import { addLabelPlaceholders } from '../../src/services/webform/followup/placeholders';

describe('addLabelPlaceholders', () => {
  it('adds language-aware label placeholders for questions, line-item fields, and subgroup paths', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'TOP',
        type: 'TEXT',
        qEn: 'Top label',
        qFr: 'Libelle haut',
        qNl: 'Boven label',
        required: false,
        status: 'Active',
        options: [],
        optionsFr: [],
        optionsNl: []
      } as any,
      {
        id: 'G',
        type: 'LINE_ITEM_GROUP',
        qEn: 'Group',
        qFr: 'Groupe',
        qNl: 'Groep',
        required: false,
        status: 'Active',
        options: [],
        optionsFr: [],
        optionsNl: [],
        lineItemConfig: {
          fields: [
            { id: 'A', labelEn: 'Alpha', labelFr: 'Alpha FR', labelNl: 'Alpha NL', type: 'TEXT' } as any
          ],
          subGroups: [
            {
              id: 'SG',
              label: { en: 'Sub', fr: 'Sous', nl: 'Sub NL' },
              fields: [
                { id: 'B', labelEn: 'Beta', labelFr: 'Beta FR', labelNl: 'Beta NL', type: 'TEXT' } as any
              ]
            } as any
          ]
        }
      } as any
    ];

    const placeholders: Record<string, string> = {};
    addLabelPlaceholders(placeholders, questions, 'FR');

    expect(placeholders['{{LABEL(TOP)}}']).toBe('Libelle haut');
    expect(placeholders['{{LABEL(G)}}']).toBe('Groupe');
    expect(placeholders['{{LABEL(G.A)}}']).toBe('Alpha FR');
    expect(placeholders['{{LABEL(G.SG)}}']).toBe('Sous');
    expect(placeholders['{{LABEL(G.SG.B)}}']).toBe('Beta FR');

    // Variant casing support (buildPlaceholderKeys): lower-case paths should also resolve.
    expect(placeholders['{{LABEL(g.sg.b)}}']).toBe('Beta FR');
  });
});

