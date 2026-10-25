import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

// Prints failed Vitest tests as GitHub Actions annotations, so they show on pull requests
// (the job logs are not always reachable).
const [reportPath = 'vitest-report.json'] = process.argv.slice(2);
const report = JSON.parse(readFileSync(reportPath, 'utf8'));

/**
 * @param {string} text
 * @returns {string}
 */
function escape(text) {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

for (const file of report.testResults ?? []) {
  const path = relative(process.cwd(), file.name);
  if (file.status === 'failed' && (file.assertionResults ?? []).length === 0) {
    console.log(`::error file=${path}::${escape(file.message || 'Test file failed')}`);
  }
  for (const t of file.assertionResults ?? []) {
    if (t.status !== 'failed') continue;
    const message = (t.failureMessages ?? []).join('\n').slice(0, 1500);
    const line = t.location?.line ?? 1;
    console.log(`::error file=${path},line=${line}::${escape(`${t.fullName}\n${message}`)}`);
  }
}
