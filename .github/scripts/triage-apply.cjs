/**
 * Check triage's verdict against the repository, then label and comment as
 * idfkit-bot.
 *
 * The model that read the issue held no tools and no credential that can
 * write; this script is the only thing that acts, and it acts only on what
 * survives the checks below. Every area must be in the roster, every duplicate
 * must be an issue that exists, every conflict must name a principle the
 * constitution has, and a verdict that is missing, malformed or contradicts
 * itself becomes "needs a person" with the reason, never a guess. Labels that
 * say where a report came from and what failed are read from the body's own
 * marker and sections, never from the model.
 *
 * Loaded by `.github/workflows/triage.yml` through github-script, which is why
 * it is CommonJS and takes `github` and `context` as arguments. `validate` is
 * pure and exported so a Node harness can feed it hostile verdicts.
 */
const fs = require('node:fs');

const MARKERS = Object.freeze({
  report: '<!-- shoebox-report v1 -->',
  triage: '<!-- shoebox-triage -->',
  starter: '<!-- shoebox-starter -->',
});

const BUCKET_LABEL = Object.freeze({ bug: 'bug', feature: 'enhancement', question: 'question' });
const BUCKET_WORDS = Object.freeze({ bug: 'a bug', feature: 'a feature request', question: 'a question' });
const NEEDS_PERSON = 'needs a person';

const BASE_LABELS = Object.freeze([
  { name: NEEDS_PERSON, color: 'd93f0b', description: 'Triage could not place this, or could not run' },
  { name: 'from the sheet', color: 'c5def5', description: 'Filed through the sheet, with captured context' },
  { name: 'no captured context', color: 'ededed', description: 'Filed by hand; triage read the words alone' },
  { name: 'run failed', color: 'fbca04', description: 'The report carries a failed run' },
  { name: 'link refused', color: 'fbca04', description: 'The report carries a refused link' },
  { name: 'station refused', color: 'fbca04', description: 'The report carries a refused weather station' },
]);

/**
 * What the model wrote, made safe to post: one line, HTML escaped, and every
 * `@` broken so a verdict can never mention a person into a thread.
 */
const plain = (text, max) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@/g, '@​');

/**
 * The verdict, or the reason there is none. Never throws: a verdict that
 * cannot be read is a report that needs a person, not a failed workflow.
 *
 * `mode === 'starter'` means a maintainer has already classified the issue as
 * a feature request, so the bucket is theirs and only the starter is read.
 */
function validate(raw, { areas = [], issues = [], principles = [] } = {}, mode = 'triage') {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'the verdict was empty' };
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return { error: 'the verdict was not JSON' };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'the verdict was not an object' };

  const dropped = [];
  let bucket = v.bucket ?? null;
  let needs = typeof v.needs_person === 'string' && v.needs_person.trim() ? plain(v.needs_person, 300) : null;
  if (mode === 'starter') {
    bucket = 'feature';
    needs = null;
  }
  if (bucket !== null && !Object.hasOwn(BUCKET_LABEL, bucket)) return { error: `the verdict named an unknown bucket, ${plain(bucket, 40)}` };
  if (bucket === null && needs === null) return { error: 'the verdict gave neither a bucket nor a reason for a person' };
  if (bucket !== null && needs !== null) return { error: 'the verdict gave both a bucket and a reason for a person' };

  const areaIds = Array.isArray(v.areas) ? v.areas : [];
  const keptAreas = [];
  for (const id of areaIds.slice(0, 5)) {
    if (typeof id === 'string' && areas.includes(id) && !keptAreas.includes(id)) keptAreas.push(id);
    else dropped.push(`the area ${plain(JSON.stringify(id), 40)}, which is not in the roster`);
  }
  if (areaIds.length > 5) dropped.push(`${areaIds.length - 5} areas past the fifth`);

  const duplicates = [];
  for (const entry of (Array.isArray(v.duplicates) ? v.duplicates : []).slice(0, 3)) {
    const number = Number(entry?.number);
    if (Number.isInteger(number) && issues.includes(number) && !duplicates.some((d) => d.number === number)) {
      duplicates.push({ number, why: plain(entry.why, 200) });
    } else {
      dropped.push(`the duplicate ${plain(String(entry?.number), 20)}, which is not an open or recent issue`);
    }
  }

  let starter = null;
  if (v.starter) {
    if (bucket !== 'feature') {
      dropped.push('a starter paragraph on a report that is not a feature request');
    } else {
      const paragraph = String(v.starter.paragraph ?? '').trim();
      if (paragraph.length < 200 || paragraph.length > 1600) {
        dropped.push(`a starter paragraph of ${paragraph.length} characters, outside 200 to 1,600`);
      } else {
        const conflicts = [];
        for (const c of Array.isArray(v.starter.conflicts) ? v.starter.conflicts : []) {
          const named = String(c?.principle ?? '').trim();
          // Named as the heading has it ("I. Everything Runs in the Browser"),
          // or by its number alone, or by its title alone.
          const match = principles.find(
            (p) => p === named || p.split('. ')[0] === named || p.slice(p.indexOf('. ') + 2) === named,
          );
          if (match) conflicts.push({ principle: match, argument: plain(c.argument, 400) });
          else dropped.push(`a conflict with ${plain(named, 80)}, which is not a principle in the constitution`);
        }
        starter = { paragraph, conflicts };
      }
    }
  }
  return { verdict: { bucket, needs_person: needs, areas: keptAreas, duplicates, starter }, dropped };
}

/** The facts only the body can give, read by rule rather than by the model. */
function readBody(body) {
  const text = String(body ?? '');
  const fromSheet = text.split('\n')[0].trim() === MARKERS.report;
  const section = (heading) => {
    const at = text.indexOf(`\n### ${heading}\n`);
    if (at < 0) return '';
    const rest = text.slice(at + heading.length + 6);
    const end = rest.search(/\n### /);
    return end < 0 ? rest : rest.slice(0, end);
  };
  return {
    fromSheet,
    // Only the engine log's own Failure line says a run failed: the status
    // line also goes bad for a refused link or station, which have labels of
    // their own.
    runFailed: fromSheet && /^- Failure: (?!—\s*$).+/m.test(section('Engine log')),
    linkRefused: fromSheet && /^- Refused link:/m.test(section('Desk')),
    stationRefused: fromSheet && /^\s*- Station refused/m.test(section('On screen')),
  };
}

const isBot = (user) => user?.type === 'Bot' || /\[bot\]$/.test(user?.login ?? '');

/** Bucket labels a person applied and the issue still carries (FR-024). */
async function humanBuckets({ github, owner, repo, number, current }) {
  const events = await github.paginate(github.rest.issues.listEvents, { owner, repo, issue_number: number, per_page: 100 });
  const bucketNames = [...Object.values(BUCKET_LABEL), NEEDS_PERSON];
  const byHuman = new Set();
  for (const name of bucketNames) {
    if (!current.has(name)) continue;
    const last = [...events].reverse().find((e) => e.event === 'labeled' && e.label?.name === name);
    if (last && !isBot(last.actor)) byHuman.add(name);
  }
  return byHuman;
}

async function ensureLabels({ github, owner, repo, areas }) {
  const existing = new Set(
    (await github.paginate(github.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 })).map((l) => l.name),
  );
  const wanted = [
    ...BASE_LABELS,
    ...areas.map((id) => ({ name: `area: ${id}`, color: 'ededed', description: `Concerns the ${id} part of the sheet` })),
  ];
  for (const label of wanted) {
    if (!existing.has(label.name)) await github.rest.issues.createLabel({ owner, repo, ...label });
  }
}

async function upsertComment({ github, owner, repo, number, comments, marker, body }) {
  const found = comments.find((c) => c.body?.includes(marker));
  if (found) await github.rest.issues.updateComment({ owner, repo, comment_id: found.id, body });
  else await github.rest.issues.createComment({ owner, repo, issue_number: number, body });
}

/** A fence longer than any run of backticks in the text, so it cannot be closed early. */
function fenced(text) {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

function starterComment(starter) {
  const lines = [
    MARKERS.starter,
    '<details>',
    '<summary>Draft for maintainers: a starting point for <code>/speckit-specify</code>, not a commitment</summary>',
    '',
  ];
  // The principle's name is the constitution's own, but "V. Only @idfkit/* at
  // Runtime" would mention the organisation, so it is made safe like the rest.
  for (const c of starter.conflicts) lines.push(`**Conflicts with ${plain(c.principle, 80)}.** ${c.argument}`, '');
  lines.push(fenced(starter.paragraph), '', '</details>');
  return lines.join('\n');
}

async function run({ github, context, core, mode, conclusion, output, factsPath, runUrl, number }) {
  const { owner, repo } = context.repo;
  let facts = { areas: [], issues: [], principles: [] };
  let contextError = null;
  try {
    facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
  } catch {
    contextError = 'the prompt could not be built';
  }

  await ensureLabels({ github, owner, repo, areas: facts.areas });
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: number });
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: number, per_page: 100 });
  const current = new Set(issue.labels.map((l) => (typeof l === 'string' ? l : l.name)));
  const human = await humanBuckets({ github, owner, repo, number, current });
  const existingTriage = comments.find((c) => c.body?.includes(MARKERS.triage))?.body ?? null;

  const add = [];
  if (mode === 'triage') {
    const body = readBody(issue.body);
    add.push(body.fromSheet ? 'from the sheet' : 'no captured context');
    if (body.runFailed) add.push('run failed');
    if (body.linkRefused) add.push('link refused');
    if (body.stationRefused) add.push('station refused');
  }

  const result = contextError
    ? { error: contextError }
    : conclusion === 'success'
      ? validate(output, facts, mode)
      : { error: `the Claude step ended as ${conclusion || 'skipped'}` };

  if (result.error) {
    core.warning(`Triage of #${number} did not produce a verdict: ${result.error}`);
    if (mode === 'triage') {
      if (!human.size) add.push(NEEDS_PERSON);
      if (add.length) await github.rest.issues.addLabels({ owner, repo, issue_number: number, labels: add });
      await upsertComment({
        github, owner, repo, number, comments, marker: MARKERS.triage,
        body: [MARKERS.triage, `**Needs a person.** Triage did not run: ${result.error}. Run: ${runUrl}`].join('\n'),
      });
    } else {
      await upsertComment({
        github, owner, repo, number, comments, marker: MARKERS.triage,
        body: [existingTriage ?? MARKERS.triage, '', `No starter paragraph was drafted: ${result.error}. Run: ${runUrl}`].join('\n'),
      });
    }
    return;
  }

  const { verdict, dropped } = result;
  const notes = [];

  if (mode === 'triage') {
    if (human.size) notes.push(`A maintainer has already labelled this ${[...human].join(', ')}, and that stands.`);
    else add.push(verdict.bucket ? BUCKET_LABEL[verdict.bucket] : NEEDS_PERSON);
    for (const id of verdict.areas) add.push(`area: ${id}`);
    await github.rest.issues.addLabels({ owner, repo, issue_number: number, labels: [...new Set(add)] });
  }

  // A starter only where the bucket that stands is a feature request: the
  // model's, when no person has placed the issue, or the maintainer's own.
  const wantStarter = mode === 'starter' || (verdict.bucket === 'feature' && !human.size);
  const hasStarter = comments.some((c) => c.body?.includes(MARKERS.starter));
  if (wantStarter && !hasStarter) {
    if (verdict.starter) {
      await github.rest.issues.createComment({ owner, repo, issue_number: number, body: starterComment(verdict.starter) });
    } else {
      notes.push('No starter paragraph was drafted: the verdict carried none that passed its checks.');
    }
  }

  if (mode === 'triage') {
    const lines = [MARKERS.triage];
    lines.push(
      verdict.bucket
        ? `**Sorted as ${BUCKET_WORDS[verdict.bucket]}**${verdict.areas.length ? `, concerning ${verdict.areas.join(', ')}` : ''}.`
        : `**Needs a person.** ${verdict.needs_person}`,
    );
    for (const d of verdict.duplicates) lines.push(`- Possibly the same as #${d.number}: ${d.why}`);
    for (const note of notes) lines.push('', note);
    if (dropped.length) lines.push('', `Set aside from the verdict: ${dropped.join('; ')}.`);
    lines.push('', 'Sorted automatically. A maintainer’s label always wins, and nothing here is closed or assigned.');
    await upsertComment({ github, owner, repo, number, comments, marker: MARKERS.triage, body: lines.join('\n') });
  } else if (notes.length || dropped.length) {
    const extra = [...notes, ...(dropped.length ? [`Set aside from the verdict: ${dropped.join('; ')}.`] : [])];
    await upsertComment({
      github, owner, repo, number, comments, marker: MARKERS.triage,
      body: [existingTriage ?? MARKERS.triage, '', ...extra].join('\n'),
    });
  }
}

module.exports = { run, validate, readBody, starterComment, MARKERS };
