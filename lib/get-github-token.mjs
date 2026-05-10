/**
 * Return the GitHub API token used by harness helpers.
 *
 * Security note: this token must never be logged and must never be returned to
 * a caller other than as a request header value for GitHub API calls.
 *
 * @returns {string|null} `GITHUB_TOKEN` when present, otherwise `null`.
 */
export function getGitHubToken() {
  // Path D upgrade insertion point: add a `gh auth token` fallback branch here.
  return process.env.GITHUB_TOKEN || null;
}

export default getGitHubToken;
