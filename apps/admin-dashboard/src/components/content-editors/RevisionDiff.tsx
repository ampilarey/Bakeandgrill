type Props = {
  before: string;
  after: string;
};

/** Lightweight visual diff — line-oriented, no heavy deps. */
export function RevisionDiff({ before, after }: Props) {
  const a = (before || '').split('\n');
  const b = (after || '').split('\n');
  const max = Math.max(a.length, b.length);
  const rows: Array<{ type: 'same' | 'del' | 'add'; text: string }> = [];

  for (let i = 0; i < max; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      if (left !== undefined) rows.push({ type: 'same', text: left });
      continue;
    }
    if (left !== undefined) rows.push({ type: 'del', text: left });
    if (right !== undefined) rows.push({ type: 'add', text: right });
  }

  if (rows.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>No differences.</p>;
  }

  return (
    <pre
      data-testid="revision-diff"
      style={{
        margin: 0, fontSize: 11, lineHeight: 1.45, fontFamily: 'ui-monospace, monospace',
        maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: 8,
      }}
    >
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            background: r.type === 'del' ? '#FEE2E2' : r.type === 'add' ? '#DCFCE7' : 'transparent',
            color: r.type === 'del' ? '#991B1B' : r.type === 'add' ? '#166534' : '#1C1408',
            padding: '1px 4px',
          }}
        >
          {r.type === 'del' ? '− ' : r.type === 'add' ? '+ ' : '  '}
          {r.text || ' '}
        </div>
      ))}
    </pre>
  );
}
