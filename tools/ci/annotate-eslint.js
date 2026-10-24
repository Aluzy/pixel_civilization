import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

// Prints ESLint results as GitHub Actions annotations, so they show on pull requests.
const [reportPath = 'eslint-report.json'] = process.argv.slice(2);
const results = JSON.parse(readFileSync(reportPath, 'utf8'));

/**
 * @param {string} text
 * @returns {string}
 */
function escape(text) {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

for (const result of results) {
  const file = relative(process.cwd(), result.filePath);
  for (const m of result.messages) {
    const level = m.severity === 2 ? 'error' : 'warning';
    const rule = m.ruleId ? ` (${m.ruleId})` : '';
    const where = `file=${file},line=${m.line ?? 1},col=${m.column ?? 1}`;
    console.log(`::${level} ${where}::${escape(m.message + rule)}`);
  }
}
