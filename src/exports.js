export function exportCsv(filename, rows) {
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const cell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const content = '\uFEFF' + [headers.map(cell).join(';'), ...rows.map(row => headers.map(key => cell(row[key])).join(';'))].join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
