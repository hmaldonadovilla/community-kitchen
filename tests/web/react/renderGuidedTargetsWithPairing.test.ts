import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { renderGuidedTargetsWithPairing } from '../../../src/web/react/features/steps/components/renderGuidedTargetsWithPairing';

describe('renderGuidedTargetsWithPairing', () => {
  it('groups pairable questions into paired row grids', () => {
    const questions: Record<string, any> = {
      customer: { id: 'customer', type: 'TEXT', pair: 'order' },
      service: { id: 'service', type: 'TEXT', pair: 'order' },
      note: { id: 'note', type: 'PARAGRAPH', pair: 'order' }
    };
    const nodes = renderGuidedTargetsWithPairing({
      targets: [
        { kind: 'question', id: 'customer' },
        { kind: 'question', id: 'service' },
        { kind: 'question', id: 'note' }
      ],
      keyPrefix: 'step',
      resolveTargetQuestion: target => questions[target.id] || null,
      renderTarget: () => null,
      renderQuestion: (q, opts) => React.createElement('span', { 'data-grid': opts?.inGrid ? 'true' : 'false' }, q.id),
      isQuestionVisible: () => true
    });

    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, nodes));

    expect(html).toContain('ck-pair-grid');
    expect(html).toContain('data-grid="true"');
    expect(html).toContain('note');
  });

  it('delegates non-question targets to the supplied renderer', () => {
    const nodes = renderGuidedTargetsWithPairing({
      targets: [{ kind: 'lineGroup', id: 'meals' }],
      keyPrefix: 'step',
      resolveTargetQuestion: () => null,
      renderTarget: target => React.createElement('section', null, target.id),
      renderQuestion: q => React.createElement('span', null, q.id),
      isQuestionVisible: () => true
    });

    expect(renderToStaticMarkup(React.createElement(React.Fragment, null, nodes))).toContain('<section>meals</section>');
  });
});
