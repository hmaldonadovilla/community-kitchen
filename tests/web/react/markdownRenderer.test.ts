import { markdownToHtmlDocument } from '../../../src/web/react/app/markdown';

describe('markdownToHtmlDocument', () => {
  it('renders GFM tables', () => {
    const md = `
## General rules

| DO | DO NOT |
| :--- | :--- |
| Clean food areas first | Clean floors before worktops |
| Wash hands | Leave dirty equipment overnight |
`.trim();

    const html = markdownToHtmlDocument(md, { title: 'Test' });
    expect(html).toContain('<table class="md-table">');
    expect(html).toContain('<th style="text-align:left;">DO</th>');
    expect(html).toContain('<th style="text-align:left;">DO NOT</th>');
    expect(html).toContain('<td style="text-align:left;">Clean food areas first</td>');
  });

  it('renders nested lists (ol -> ul) inside list items', () => {
    const md = `
1. First
   - Sub A
   - Sub B
2. Second
`.trim();

    const html = markdownToHtmlDocument(md, { title: 'Test' });
    // Nested <ul> should appear inside the first <li> of the outer <ol>.
    expect(html).toMatch(/<ol>[\s\S]*<li>First[\s\S]*<ul>[\s\S]*<li>Sub A<\/li>[\s\S]*<\/ul>[\s\S]*<\/li>/);
  });
});


