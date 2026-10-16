'use strict';

// Run with Node. Optionally pass a private workbook path as the first argument
// (or set OMR_TEST_WORKBOOK); workbook contents are never printed or copied.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workbookPath = process.argv[2] || process.env.OMR_TEST_WORKBOOK;
const files = ['omr.html', 'omr-v2.html', 'cumulative.html'];
const marker = /\/\/ Workbook sheet selection start\r?\n([\s\S]*?)\/\/ Workbook sheet selection end/;
const options = { header: 1, defval: null };
let total = 0;

function equalRows(actual, expected, message) {
  // Comparing serialized rows avoids cross-realm Array prototype differences.
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

async function main() {
for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const vendor = scripts.find(match => match[1].includes('/*! xlsx.js'));
  assert.ok(vendor, `${file}: embedded XLSX library is present`);
  const helper = html.match(marker);
  assert.ok(helper, `${file}: workbook helper markers are present`);
  assert.match(html.replace(marker, ''), /\bworkbookRows\s*\(/,
    `${file}: the file reader calls the helper`);

  const context = vm.createContext({ console, TextDecoder, TextEncoder, setTimeout, clearTimeout });
  vm.runInContext(vendor[1], context, { timeout: 30000, filename: `${file}:xlsx` });
  vm.runInContext(helper[1], context, { timeout: 1000, filename: `${file}:workbookRows` });
  const XLSX = context.XLSX;
  const workbookRows = context.workbookRows;
  assert.equal(typeof workbookRows, 'function', `${file}: helper is callable`);

  function workbook(entries) {
    return {
      SheetNames: entries.map(entry => entry.name),
      Sheets: Object.fromEntries(entries.map(entry => {
        const sheet = entry.sheet || XLSX.utils.aoa_to_sheet(entry.rows || []);
        if (entry.type) sheet['!type'] = entry.type;
        return [entry.name, sheet];
      })),
      Workbook: { Sheets: entries.map(entry => ({ name: entry.name, Hidden: entry.hidden || 0 })) }
    };
  }

  function check(name, entries, expected, callerOptions = options) {
    equalRows(workbookRows(workbook(entries), callerOptions), expected, `${file}: ${name}`);
    total++;
  }

  const answers = [['Name', 'Q1', 'Q2'], ['Anonymous', 1, 2]];
  const otherAnswers = [['Name', 'Q1', 'Q2'], ['Other', 3, 4], ['Third', 1, 1]];
  const chartFirst = workbook([
    { name: 'Chart1', type: 'chart', rows: [[4]] },
    { name: 'Answers', rows: answers }
  ]);
  const baseline = XLSX.utils.sheet_to_json(chartFirst.Sheets[chartFirst.SheetNames[0]], options);
  assert.ok(baseline.length < 2, `${file}: chart-first fixture reproduces the previous rejection`);
  total++;
  check('chart-first workbook', [
    { name: 'Chart1', type: 'chart', rows: [[4]] },
    { name: 'Answers', rows: answers }
  ], answers);
  check('chart is skipped even with multiple populated rows', [
    { name: 'Chart1', type: 'chart', rows: otherAnswers },
    { name: 'Answers', rows: answers }
  ], answers);
  check('empty first worksheet', [
    { name: 'Empty', rows: [] }, { name: 'Answers', rows: answers }
  ], answers);

  const blankSheet = {
    '!ref': 'A1:C5',
    A1: { t: 's', v: ' ' }, B3: { t: 's', v: '\t' }, C5: { t: 's', v: '\r\n' }
  };
  check('multiple formatted blank or whitespace rows are not data', [
    { name: 'Empty', sheet: blankSheet }, { name: 'Answers', rows: answers }
  ], answers);
  check('single meaningful header row is skipped', [
    { name: 'Header', rows: [['Name', 'Q1', 'Q2']] },
    { name: 'Answers', rows: answers }
  ], answers);
  const singleHeaderWithBlanks = XLSX.utils.aoa_to_sheet([['Name', 'Q1', 'Q2']]);
  singleHeaderWithBlanks['!ref'] = 'A1:C8';
  check('one meaningful row plus blank rows is skipped', [
    { name: 'Header', sheet: singleHeaderWithBlanks },
    { name: 'Answers', rows: answers }
  ], answers);
  check('first usable ordinary worksheet is preserved', [
    { name: 'Exam A', rows: answers }, { name: 'Exam B', rows: otherAnswers }
  ], answers);
  check('hidden state does not reorder ordinary worksheets', [
    { name: 'Exam A', rows: answers, hidden: 1 }, { name: 'Exam B', rows: otherAnswers }
  ], answers);
  const roster = [['Student ID', 'Percentile'], ['Anonymous', 75]];
  check('roster and percentile sheets remain supported', [
    { name: 'Roster', rows: roster }, { name: 'Answers', rows: answers }
  ], roster);

  const rowsWithBlanks = [
    [null, null, null], ['Name', 'Q1', 'Q2'], [null, null, null],
    ['Anonymous', 1, null], [null, null, null]
  ];
  const sheetWithBlanks = XLSX.utils.aoa_to_sheet(rowsWithBlanks);
  sheetWithBlanks['!ref'] = 'A1:C5';
  check('selected rows retain blank rows and original header positions', [
    { name: 'Answers', sheet: sheetWithBlanks }
  ], rowsWithBlanks);
  check('numeric zero and false are meaningful cells', [
    { name: 'Values', rows: [[0], [false]] }, { name: 'Answers', rows: answers }
  ], [[0], [false]]);
  check('chart-only workbook has no usable worksheet', [
    { name: 'Chart1', type: 'chart', rows: otherAnswers }
  ], []);
  check('empty and header-only workbook has no usable worksheet', [
    { name: 'Empty', rows: [] }, { name: 'Header', rows: [['Name', 'Q1']] }
  ], []);
  check('workbook without sheets', [], []);

  const formatted = {
    '!ref': 'A1:B2', A1: { t: 's', v: 'Score' }, B1: { t: 's', v: 'Note' },
    A2: { t: 'n', v: 0.25, w: '25%' }
  };
  check('raw false and defval options are passed through', [
    { name: 'Formatted', sheet: formatted }
  ], [['Score', 'Note'], ['25%', 'missing']], { header: 1, raw: false, defval: 'missing' });
  check('cumulative raw true options are passed through', [
    { name: 'Formatted', sheet: formatted }
  ], [['Score', 'Note'], [0.25, null]], { header: 1, raw: true, defval: null });

  const loader = file === 'cumulative.html'
    ? html.match(/function readFile\(f\)\{[\s\S]*?\r?\n\}/)
    : html.match(/function load\(f\)\{[\s\S]*?(?=function reset\(\))/);
  assert.ok(loader, `${file}: the actual file reader can be isolated`);
  vm.runInContext(loader[0], context, { timeout: 1000, filename: `${file}:fileReader` });

  async function importFile(name, contents, overrideWorkbook) {
    const realRead = XLSX.read;
    const state = { setup: 0, cache: 0, errors: [], modes: [], reads: 0 };
    context.ROWS = null;
    context.FNAME = '';
    context.setLoading = () => {};
    context.showSetup = () => { state.setup++; };
    context.saveOmrCache = () => { state.cache++; };
    context.toast = message => { state.errors.push(message); };
    context.setTimeout = callback => { callback(); return 0; };
    context.FileReader = class {
      readAsArrayBuffer() {
        state.modes.push('array');
        this.onload({ target: { result: contents } });
      }
      readAsText() {
        state.modes.push('text');
        this.onload({ target: { result: contents } });
      }
    };
    XLSX.read = (...args) => {
      state.reads++;
      return overrideWorkbook || realRead(...args);
    };
    try {
      if (file === 'cumulative.html') state.rows = await context.readFile({ name });
      else {
        context.load({ name });
        state.rows = context.ROWS;
      }
      return state;
    } finally {
      XLSX.read = realRead;
    }
  }

  const importedChart = await importFile('chart-first.xlsx', new Uint8Array([0]), chartFirst);
  equalRows(importedChart.rows, answers, `${file}: actual reader skips the first chart`);
  assert.equal(importedChart.reads, 1, `${file}: actual reader decodes the workbook once`);
  if (file !== 'cumulative.html') {
    assert.equal(importedChart.setup, 1, `${file}: chart-first input reaches setup`);
    assert.equal(importedChart.cache, 1, `${file}: chart-first input reaches the existing cache`);
    assert.equal(importedChart.errors.length, 0, `${file}: chart-first input has no error toast`);
  }
  total++;

  if (file !== 'cumulative.html') {
    const csvParser = html.match(/function parseCSV\(txt\)\{[^\r\n]+/);
    assert.ok(csvParser, `${file}: CSV parser is still present`);
    assert.match(html, /if\s*\(csv\)\s*ROWS\s*=\s*parseCSV\(ev\.target\.result\)/,
      `${file}: CSV input uses its existing parser`);
    vm.runInContext(csvParser[0], context, { timeout: 1000, filename: `${file}:parseCSV` });
    equalRows(context.parseCSV('Name,Q1\r\n"Anonymous, A",2'),
      [['Name', 'Q1'], ['Anonymous, A', '2']], `${file}: CSV parsing remains unchanged`);
    const importedCsv = await importFile('answers.csv', 'Name,Q1\r\n"Anonymous, A",2');
    equalRows(importedCsv.rows, [['Name', 'Q1'], ['Anonymous, A', '2']],
      `${file}: actual CSV reader keeps the existing format`);
    assert.equal(importedCsv.reads, 0, `${file}: CSV input does not invoke workbook selection`);
    assert.equal(importedCsv.modes[0], 'text', `${file}: CSV input is still read as text`);
    assert.equal(importedCsv.setup, 1, `${file}: CSV input reaches setup`);
    total++;
  }

  if (workbookPath) {
    const data = new Uint8Array(fs.readFileSync(workbookPath));
    const wb = XLSX.read(data, { type: 'array' });
    const oldRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], options);
    if (wb.Sheets[wb.SheetNames[0]]['!type'] === 'chart') {
      assert.ok(oldRows.length < 2, `${file}: private chart-first workbook reproduces rejection`);
    }
    const selected = workbookRows(wb, options);
    const expected = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1, options);
    // Use boolean assertions so private workbook values cannot appear in failures.
    assert.ok(JSON.stringify(selected) === JSON.stringify(expected),
      `${file}: fixed selection equals the original Sheet1 rows`);
    assert.ok(selected.length === 108 && Math.max(...selected.map(row => row.length)) === 56,
      `${file}: private regression workbook retains 108 rows and 56 columns`);
    const imported = await importFile('private-regression.xlsx', data);
    assert.ok(JSON.stringify(imported.rows) === JSON.stringify(expected),
      `${file}: actual file reader preserves all private Sheet1 rows`);
    if (file !== 'cumulative.html') {
      assert.ok(imported.setup === 1 && imported.cache === 1 && imported.errors.length === 0,
        `${file}: actual private input reaches setup and cache without an error`);
    }
    console.log(`${file}: private workbook baseline ${oldRows.length} row; selected 108 rows x 56 columns`);
    total++;
  }

  console.log(`${file}: workbook selection regressions passed`);
}

console.log(`PASS ${total} regression checks across ${files.length} applications`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
