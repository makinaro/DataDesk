// The commands CI and the commit-msg hook run. Unlike an `import.meta.url === argv[1]` guard,
// this file always runs, so it can't exit 0 without checking anything. The lint modules are
// imported inside main(), so a broken install or module lands in the catch below (exit 2).
//
//   PR_TITLE=<title> node scripts/gitConventionsCli.mjs pr-title
//   node scripts/gitConventionsCli.mjs commit-msg <file>
//   git log --no-merges --format=%s A..B | node scripts/gitConventionsCli.mjs merge-headers
//
// Exit codes: 0 valid, 1 a rule failed, 2 misuse or crash.
import { readFileSync } from 'node:fs';

const DOC = 'docs/conventions/git-conventions.md';

/** @param {string[]} args */
async function main(args) {
  const [command, file] = args;

  if (command === 'pr-title' && process.env['PR_TITLE'] !== undefined) {
    const title = process.env['PR_TITLE'];
    const { lintPrTitle } = await import('./gitConventions.mjs');
    const result = await lintPrTitle(title);
    for (const warning of result.warnings) console.warn(`  warning: ${warning}`);
    if (result.valid) {
      console.log(`PR title OK: ${title}`);
      return 0;
    }
    console.error(`PR title does not follow ${DOC}: ${title}`);
    for (const error of result.errors) console.error(`  - ${error}`);
    return 1;
  }

  // Runs before `commitlint --edit`, which passes a message that is empty once "#" lines are
  // stripped, as `git commit -m "#42 fix"` leaves it.
  if (command === 'commit-msg' && file !== undefined) {
    const { isBlankMessage } = await import('./gitConventionsData.mjs');
    if (!isBlankMessage(readFileSync(file, 'utf8'))) return 0;
    console.error(
      `The commit message is empty once lines starting with "#" are removed. ` +
        `Start it with type(scope): summary (${DOC}).`,
    );
    return 1;
  }

  // The merge exemption trusts the header, so a single-parent commit (git log --no-merges)
  // must not carry one.
  if (command === 'merge-headers') {
    const { isMergeCommit } = await import('./gitConventionsData.mjs');
    const fakes = readFileSync(0, 'utf8')
      .split(/\r?\n/)
      .filter((subject) => isMergeCommit(subject));
    if (fakes.length === 0) return 0;
    console.error(`These commits have one parent but a merge header, which skips linting:`);
    for (const subject of fakes) console.error(`  - ${subject}`);
    return 1;
  }

  console.error(
    'usage: PR_TITLE=<title> node scripts/gitConventionsCli.mjs pr-title\n' +
      '       node scripts/gitConventionsCli.mjs commit-msg <file>\n' +
      '       git log --no-merges --format=%s A..B | node scripts/gitConventionsCli.mjs merge-headers',
  );
  return 2;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error);
  process.exitCode = 2;
}
