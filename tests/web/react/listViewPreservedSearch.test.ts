import fs from 'fs';
import path from 'path';

describe('ListView preserved search state wiring', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../src/web/react/components/ListView.tsx'),
    'utf8'
  );

  it('captures inline search state before rule action buttons open records', () => {
    const clickLogIndex = source.indexOf("onDiagnostic?.('list.ruleColumn.click'");
    const preserveIndex = source.indexOf('preserveCurrentInlineSearchState();', clickLogIndex);
    const selectIndex = source.indexOf('onSelect(row, resolveCachedRecordForRow(row)', clickLogIndex);

    expect(clickLogIndex).toBeGreaterThan(-1);
    expect(preserveIndex).toBeGreaterThan(clickLogIndex);
    expect(selectIndex).toBeGreaterThan(preserveIndex);
  });
});
