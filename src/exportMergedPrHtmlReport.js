const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_LIMIT = 200;
const DEFAULT_OUTPUT = 'reports/merged-prs-report.html';
const DEFAULT_STATE = 'merged';
const VALID_STATES = new Set(['merged', 'closed', 'open', 'all']);
const monthFormatter = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateFormatter = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const formatDate = (value) => dateFormatter.format(new Date(value));
const formatMonth = (value) => monthFormatter.format(new Date(value));
const formatBody = (value) => (value ? escapeHtml(value) : 'No PR description provided.');
const formatAuthor = (value) => escapeHtml(value?.login || 'Unknown');
const formatBranch = ({ headRefName, baseRefName }) => `${escapeHtml(headRefName || 'Unknown')} → ${escapeHtml(baseRefName || 'Unknown')}`;
const formatShortSha = (value) => escapeHtml((value || 'Unknown').slice(0, 7));
const formatCommitAuthors = (value) => escapeHtml(value?.[0]?.login || value?.[0]?.name || 'Unknown');
const formatOptionalDate = (value) => escapeHtml(value ? formatDate(value) : 'Unknown');
const formatChangeSummary = ({ additions, deletions, changedFiles, files }) =>
  `+${additions || 0} / -${deletions || 0} across ${changedFiles || files?.length || 0} files`;
const formatPatch = (value) => escapeHtml(value || 'Diff patch not available.');
const parsePrState = (value) => (VALID_STATES.has((value || '').toLowerCase()) ? value.toLowerCase() : DEFAULT_STATE);
const filterComments = ({ comments = [], excludeGithubActionsComments = false }) =>
  excludeGithubActionsComments ? comments.filter((comment) => (comment.author?.login || '').toLowerCase() !== 'github-actions') : comments;
const getPrimaryDateValue = ({ pr, prState = DEFAULT_STATE }) => {
  if (prState === 'open') return pr.createdAt;
  if (prState === 'closed') return pr.closedAt || pr.createdAt;
  if (prState === 'all') return pr.mergedAt || pr.closedAt || pr.createdAt;
  return pr.mergedAt || pr.closedAt || pr.createdAt;
};
const getPrimaryDateLabel = ({ pr, prState = DEFAULT_STATE }) => {
  if (prState === 'open') return 'Opened';
  if (prState === 'closed') return 'Closed';
  if (prState === 'merged') return 'Merged';
  if (pr.state === 'OPEN') return 'Opened';
  return pr.mergedAt ? 'Merged' : 'Closed';
};
const getReportLabel = (prState = DEFAULT_STATE) => parsePrState(prState);
const getSummaryDateLabel = (prState = DEFAULT_STATE) => {
  if (prState === 'open') return 'opened';
  if (prState === 'closed') return 'closed';
  if (prState === 'all') return 'activity';
  return 'merged';
};

const renderDescriptionSection = (body) =>
  `<details class="pr-section"><summary>Description</summary><p class="pr-body">${formatBody(body)}</p></details>`;

const renderCommitsSection = (commits = []) => {
  const items = commits
    .map(
      (commit) =>
        `<li class="commit-item"><h4>${formatShortSha(commit.oid)} ${escapeHtml(commit.messageHeadline || 'Untitled commit')}</h4><dl class="commit-meta"><div><dt>Author</dt><dd>${formatCommitAuthors(
          commit.authors,
        )}</dd></div><div><dt>Committed</dt><dd>${escapeHtml(formatDate(commit.committedDate || commit.authoredDate))}</dd></div></dl>${
          commit.messageBody ? `<p class="commit-body">${escapeHtml(commit.messageBody)}</p>` : ''
        }</li>`,
    )
    .join('');
  return `<details class="pr-section"><summary>Commits (${commits.length})</summary>${
    commits.length === 0 ? '<p class="section-empty">No commit details available.</p>' : `<ul class="commit-list">${items}</ul>`
  }</details>`;
};

const renderReviewsSection = (reviews = []) => {
  const items = reviews
    .map(
      (review) =>
        `<li class="review-item"><h4>${escapeHtml(review.state || 'PENDING')} · ${formatAuthor(review.author)}</h4><dl class="detail-meta"><div><dt>Submitted</dt><dd>${formatOptionalDate(
          review.submittedAt,
        )}</dd></div><div><dt>Commit</dt><dd>${formatShortSha(review.commit?.oid)}</dd></div></dl>${
          review.body ? `<p class="detail-body">${escapeHtml(review.body)}</p>` : ''
        }</li>`,
    )
    .join('');
  return `<details class="pr-section"><summary>Reviews (${reviews.length})</summary>${
    reviews.length === 0 ? '<p class="section-empty">No review details available.</p>' : `<ul class="review-list">${items}</ul>`
  }</details>`;
};

const renderCommentsSection = (comments = []) => {
  const items = comments
    .map(
      (comment) =>
        `<li class="comment-item"><h4>${formatAuthor(comment.author)}</h4><dl class="detail-meta"><div><dt>Created</dt><dd>${formatOptionalDate(
          comment.createdAt,
        )}</dd></div></dl>${comment.body ? `<p class="detail-body">${escapeHtml(comment.body)}</p>` : ''}${
          comment.url ? `<p><a href="${escapeHtml(comment.url)}">View comment</a></p>` : ''
        }</li>`,
    )
    .join('');
  return `<details class="pr-section"><summary>Comments (${comments.length})</summary>${
    comments.length === 0 ? '<p class="section-empty">No comment details available.</p>' : `<ul class="comment-list">${items}</ul>`
  }</details>`;
};

const renderFilesSection = (pr, { includeDiffs = true } = {}) => {
  const files = pr.files || [];
  const items = files
    .map(
      (file) =>
        `<li><details class="pr-file"><summary>${escapeHtml(file.path)}</summary><p class="file-stats">${escapeHtml(
          file.status || 'unknown',
        )} · +${file.additions || 0} / -${file.deletions || 0}</p>${
          includeDiffs && file.blobUrl ? `<p><a href="${escapeHtml(file.blobUrl)}">View file</a></p>` : ''
        }${
          includeDiffs
            ? `<pre class="pr-patch">${formatPatch(file.patch)}</pre>`
            : '<p class="section-empty">Diff details omitted for lightweight mode.</p>'
        }</details></li>`,
    )
    .join('');
  return `<details class="pr-section"><summary>Files changed (${pr.changedFiles || files.length})</summary>${
    files.length === 0 ? '<p class="section-empty">No file details available.</p>' : `<ul class="file-list">${items}</ul>`
  }</details>`;
};

const parseArguments = (argv) => {
  const initial = {
    author: '@me',
    limit: DEFAULT_LIMIT,
    output: DEFAULT_OUTPUT,
    state: DEFAULT_STATE,
    repo: '',
    includeDiffs: true,
    excludeGithubActionsComments: false,
  };
  return argv.reduce((options, arg, index, args) => {
    if (arg === '--author') return { ...options, author: args[index + 1] || options.author };
    if (arg === '--output') return { ...options, output: args[index + 1] || options.output };
    if (arg === '--limit') return { ...options, limit: Number(args[index + 1]) || options.limit };
    if (arg === '--state') return { ...options, state: parsePrState(args[index + 1]) };
    if (arg === '--repo') return { ...options, repo: args[index + 1] || options.repo };
    if (arg === '--no-diffs') return { ...options, includeDiffs: false };
    if (arg === '--no-github-actions-comments') return { ...options, excludeGithubActionsComments: true };
    if (arg === '--help' || arg === '-h') return { ...options, help: true };
    return options;
  }, initial);
};

const createGhRunner = () => (args) => execFileSync('gh', args, { cwd: process.cwd(), encoding: 'utf8' }).trim();

const fetchPullRequestFileDetails = ({ repo, number, runGh }) => JSON.parse(runGh(['api', `repos/${repo}/pulls/${number}/files`]));

const mergeFileDetails = ({ files = [], fileDetails = [] }) =>
  files.map((file) => {
    const detail = fileDetails.find((candidate) => candidate.filename === file.path);
    return {
      ...file,
      status: detail?.status || file.status,
      patch: detail?.patch || file.patch,
      blobUrl: detail?.blob_url || file.blobUrl,
      rawUrl: detail?.raw_url || file.rawUrl,
    };
  });

const resolveRepoName = ({ repo, runGh = createGhRunner() }) =>
  (repo ? repo : runGh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']));

const fetchMergedPullRequests = ({ author, limit, repo, state = DEFAULT_STATE, includeDiffs = true, runGh = createGhRunner() }) => {
  const repoName = resolveRepoName({ repo, runGh });
  const args = [
    'pr',
    'list',
    '--state',
    parsePrState(state),
    '--limit',
    String(limit),
    '--author',
    author,
    '--json',
    'number,title,body,url,state,createdAt,closedAt,mergedAt,author,baseRefName,headRefName,changedFiles,additions,deletions,commits,files,labels,reviews,comments',
    '--repo',
    repoName,
  ];
  return JSON.parse(runGh(args)).map((pr) =>
    includeDiffs
      ? {
          ...pr,
          files: mergeFileDetails({
            files: pr.files,
            fileDetails: fetchPullRequestFileDetails({ repo: repoName, number: pr.number, runGh }),
          }),
        }
      : pr,
  );
};

const buildHtmlReport = ({ author, generatedAt, prs, repoName, prState = DEFAULT_STATE, includeDiffs = true, excludeGithubActionsComments = false }) => {
  const reportLabel = getReportLabel(prState);
  const sortedPrs = [...prs].sort((left, right) => getPrimaryDateValue({ pr: right, prState: reportLabel }).localeCompare(getPrimaryDateValue({ pr: left, prState: reportLabel })));
  const grouped = sortedPrs.reduce((accumulator, pr) => {
    const key = getPrimaryDateValue({ pr, prState: reportLabel }).slice(0, 7);
    const current = accumulator[key] || [];
    return { ...accumulator, [key]: [...current, pr] };
  }, {});
  const sections = Object.keys(grouped)
    .sort((left, right) => right.localeCompare(left))
    .map((key) => {
      const title = formatMonth(`${key}-01T00:00:00.000Z`);
      const items = grouped[key]
        .map(
          (pr) => {
            const primaryDateLabel = getPrimaryDateLabel({ pr, prState: reportLabel });
            const primaryDateValue = getPrimaryDateValue({ pr, prState: reportLabel });
            return (
            `<li><article class="pr-card"><div class="pr-header"><div><h3>#${pr.number} ${escapeHtml(pr.title)}</h3><a href="${escapeHtml(
              pr.url,
            )}">View pull request</a></div><span>${escapeHtml(formatDate(primaryDateValue))}</span></div><dl class="pr-meta"><div><dt>Author</dt><dd>${formatAuthor(
              pr.author,
            )}</dd></div><div><dt>Branch</dt><dd>${formatBranch(pr)}</dd></div><div><dt>Created</dt><dd>${escapeHtml(
              formatDate(pr.createdAt),
            )}</dd></div><div><dt>${escapeHtml(primaryDateLabel)}</dt><dd>${escapeHtml(formatDate(primaryDateValue))}</dd></div><div><dt>Changes</dt><dd>${escapeHtml(
              formatChangeSummary(pr),
            )}</dd></div></dl>${renderDescriptionSection(pr.body)}${renderCommitsSection(pr.commits)}${renderReviewsSection(
              pr.reviews,
            )}${renderCommentsSection(filterComments({ comments: pr.comments, excludeGithubActionsComments }))}${renderFilesSection(pr, { includeDiffs })}</article></li>`
            );
          },
        )
        .join('');
      return `<section><h2>${escapeHtml(title)}</h2><ul>${items}</ul></section>`;
    })
    .join('');
  const firstPrimaryDate = sortedPrs[0] ? formatDate(getPrimaryDateValue({ pr: sortedPrs[0], prState: reportLabel })) : '—';
  const lastPrimaryDate = sortedPrs[sortedPrs.length - 1] ? formatDate(getPrimaryDateValue({ pr: sortedPrs[sortedPrs.length - 1], prState: reportLabel })) : '—';
  const emptyState = sortedPrs.length === 0 ? `<p class="empty">No ${escapeHtml(reportLabel)} pull requests were found for this selection.</p>` : sections;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(author)} ${escapeHtml(reportLabel)} PR report · ${escapeHtml(repoName)}</title><style>body{font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:0;background:#f5f7fb;color:#172033}main{max-width:960px;margin:0 auto;padding:32px 20px 64px}header,section,.summary,.empty{background:#fff;border-radius:16px;box-shadow:0 8px 24px rgba(23,32,51,.08)}header,section,.empty{padding:24px;margin-bottom:20px}dl.summary,.pr-meta,.commit-meta,.detail-meta{display:grid;gap:16px}.summary{grid-template-columns:repeat(3,minmax(0,1fr));padding:24px;margin:20px 0}.pr-meta{grid-template-columns:repeat(2,minmax(0,1fr));margin:16px 0}.commit-meta,.detail-meta{grid-template-columns:repeat(2,minmax(0,1fr));margin:12px 0}.pr-card{width:100%}dt{font-size:14px;color:#58627a}dd{margin:8px 0 0;font-weight:700}.summary dd{font-size:28px}ul{list-style:none;padding:0;margin:0}li{padding:20px 0;border-top:1px solid #e6eaf2}li:first-child{border-top:0}.pr-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.pr-header h3,.commit-item h4,.review-item h4,.comment-item h4{margin:0 0 8px}.pr-section,.pr-file{margin-top:16px;border:1px solid #e6eaf2;border-radius:12px;padding:12px 16px}.pr-section summary,.pr-file summary{cursor:pointer;font-weight:600}.pr-body,.commit-body,.detail-body{margin:12px 0 0;white-space:pre-wrap}.commit-list,.review-list,.comment-list,.file-list{margin-top:12px}.commit-item,.review-item,.comment-item{padding:12px 0;border-top:1px solid #e6eaf2}.commit-item:first-child,.review-item:first-child,.comment-item:first-child{border-top:0;padding-top:0}.file-stats,.section-empty{margin:12px 0 0;color:#58627a}.pr-patch{margin:12px 0 0;padding:12px;background:#f5f7fb;border-radius:10px;overflow:auto;white-space:pre-wrap;font:13px/1.4 SFMono-Regular,Menlo,Monaco,Consolas,monospace}a{color:#0b57d0;text-decoration:none;font-weight:600}span{white-space:nowrap;color:#58627a}@media (max-width:720px){.summary,.pr-meta,.commit-meta,.detail-meta{grid-template-columns:1fr}.pr-header{flex-direction:column}span{white-space:normal}}</style></head><body><main><header><p>${escapeHtml(reportLabel)} pull request report</p><h1>${escapeHtml(author)}</h1><p>${escapeHtml(repoName)} · Generated ${escapeHtml(formatDate(generatedAt))}</p></header><dl class="summary"><div><dt>Total ${escapeHtml(reportLabel)} PRs</dt><dd>${sortedPrs.length}</dd></div><div><dt>Newest ${escapeHtml(getSummaryDateLabel(reportLabel))}</dt><dd>${escapeHtml(firstPrimaryDate)}</dd></div><div><dt>Oldest ${escapeHtml(getSummaryDateLabel(reportLabel))}</dt><dd>${escapeHtml(lastPrimaryDate)}</dd></div></dl>${emptyState}</main></body></html>`;
};

const printHelp = ({ stdout = process.stdout } = {}) => {
  stdout.write(
    [
      'Usage: (pr-report-tool|prt) [--author <user>] [--repo <owner/repo>] [--state <merged|closed|open|all>] [--limit <count>] [--output <path>] [--no-diffs] [--no-github-actions-comments]',
      '',
      'Examples:',
      '  prt --repo owner/repo --author @me --state open',
      '  pr-report-tool --repo owner/repo --author @me --state all',
      '',
    ].join('\n'),
  );
};

const main = ({ argv = process.argv.slice(2), stdout = process.stdout } = {}) => {
  const options = parseArguments(argv);
  if (options.help) return printHelp({ stdout });
  const repoName = resolveRepoName(options);
  const prs = fetchMergedPullRequests({ ...options, repo: repoName });
  const outputPath = path.resolve(process.cwd(), options.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    buildHtmlReport({
      author: options.author,
      generatedAt: new Date().toISOString(),
      prs,
      prState: options.state,
      repoName,
      includeDiffs: options.includeDiffs,
      excludeGithubActionsComments: options.excludeGithubActionsComments,
    }),
  );
  stdout.write(`Saved ${options.state} PR report to ${outputPath}\n`);
};

module.exports = {
  buildHtmlReport,
  createGhRunner,
  fetchMergedPullRequests,
  main,
  parseArguments,
  printHelp,
  resolveRepoName,
};