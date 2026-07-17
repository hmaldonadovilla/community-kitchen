import path from 'path';
import { build } from 'esbuild';

const compileMarkdownTree = async (markdown: string): Promise<any> => {
  const root = path.resolve(__dirname, '../../..');
  const result = await build({
    stdin: {
      contents: `
        import { unified } from 'unified';
        import remarkParse from 'remark-parse';
        import remarkGfmIos15 from './src/web/react/app/remarkGfmIos15';

        const markdown = ${JSON.stringify(markdown)};
        const processor = unified().use(remarkParse).use(remarkGfmIos15);
        module.exports = processor.runSync(processor.parse(markdown));
      `,
      loader: 'ts',
      resolveDir: root,
      sourcefile: 'markdown-ios15-test-entry.ts'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    write: false
  });
  const output = result.outputFiles?.[0]?.text || '';
  if (!output) throw new Error('Markdown compatibility test bundle was empty.');
  const compiledModule = { exports: {} as any };
  const execute = new Function('require', 'module', 'exports', output);
  execute(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
};

const collectNodeTypes = (value: any, output: string[] = []): string[] => {
  if (!value || typeof value !== 'object') return output;
  if (typeof value.type === 'string') output.push(value.type);
  Object.values(value).forEach(child => collectNodeTypes(child, output));
  return output;
};

describe('iOS 15-compatible Markdown components', () => {
  test('renders GFM tables, task lists, strikethrough, footnotes, and normal links', async () => {
    const markdown = [
      '| Item | Done |',
      '| --- | --- |',
      '| Prep | Yes |',
      '',
      '- [x] Checked',
      '',
      '~~Removed~~',
      '',
      'Footnote[^1]',
      '',
      '[^1]: Detail',
      '',
      '[Community Kitchen](https://communitykitchen.be)'
    ].join('\n');

    const tree = await compileMarkdownTree(markdown);
    const nodeTypes = collectNodeTypes(tree);

    expect(nodeTypes).toContain('table');
    expect(nodeTypes).toContain('delete');
    expect(nodeTypes).toContain('footnoteReference');
    expect(nodeTypes).toContain('footnoteDefinition');
    expect(nodeTypes).toContain('link');
    expect(JSON.stringify(tree)).toContain('"checked":true');
  });
});
