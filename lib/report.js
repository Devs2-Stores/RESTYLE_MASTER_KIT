'use strict';

function escapeMarkdownCell(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function printMarkdownTable(headers, rows, log = console.log) {
  log(`| ${headers.map(escapeMarkdownCell).join(' | ')} |`);
  log(`|${headers.map(() => '---').join('|')}|`);
  for (const row of rows) {
    log(`| ${row.map(escapeMarkdownCell).join(' | ')} |`);
  }
}

function printFindingsTable(findings, log = console.log) {
  if (!findings.length) return;
  printMarkdownTable(
    ['Severity', 'Rule', 'Location', 'Message'],
    findings.map((finding) => [finding.severity, finding.rule, finding.location, finding.message]),
    log
  );
}

function printRuleSummary(summary, log = console.log) {
  for (const [rule, count] of Object.entries(summary)) {
    log(`- ${rule}: ${count}`);
  }
}

module.exports = {
  escapeMarkdownCell,
  printMarkdownTable,
  printFindingsTable,
  printRuleSummary
};
