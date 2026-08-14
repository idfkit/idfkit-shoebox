/**
 * Keep exactly one preview comment on a pull request, in place.
 *
 * A pull request is pushed to many times and each push republishes the preview,
 * so posting a comment per run would bury the conversation under identical
 * links. The comment is found again by an HTML marker rather than by author or
 * by position: the author is an app token that could be reissued and the
 * position moves with every review, while the marker is invisible in the
 * rendered comment and survives an edit of the text around it.
 *
 * Loaded by `.github/workflows/preview.yml` through github-script, which is why
 * this is CommonJS and takes `github` and `context` as arguments rather than
 * importing them.
 *
 * @param {object} options
 * @param {object} options.github  the authenticated Octokit github-script provides
 * @param {object} options.context the workflow context github-script provides
 * @param {string} options.body    the comment to leave, marker included
 * @param {boolean} [options.edit] only edit an existing comment; do not create
 *   one. Set when a pull request closes: if the publish never happened there is
 *   nothing to retire, and announcing the removal of a preview that never
 *   existed is worse than saying nothing.
 */
const MARKER = '<!-- shoebox-preview-comment -->';

module.exports = async ({ github, context, body, edit = false }) => {
  if (!body.includes(MARKER)) {
    throw new Error(`The comment must carry ${MARKER}, or the next run cannot find it.`);
  }

  const { owner, repo } = context.repo;
  const issue_number = context.issue.number;

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
  });
  const existing = comments.find((comment) => comment.body.includes(MARKER));

  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    return;
  }
  if (edit) return;

  await github.rest.issues.createComment({ owner, repo, issue_number, body });
};
