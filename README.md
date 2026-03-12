# pr-report-tool

Standalone GitHub CLI report generator for exporting pull requests into a readable self-contained HTML report.

## Requirements

- Node.js 18+
- `gh` installed and authenticated

## What it exports

- pull requests grouped by the most relevant month for the selected state
- inline PR metadata
- collapsible sections for descriptions, commits, reviews, comments, and changed files
- optional rich diff patches
- optional exclusion of `github-actions` comments

## Install

This tool currently uses only built-in Node.js modules, so there are no runtime npm dependencies to install.

### Local CLI install with `npm link`

If you want to run `pr-report-tool` or `prt` from any directory on your machine during local development:

- `cd /Users/shubham/personal_github_projects/pr-report-tool`
- `npm link`

Then you can run commands like:

- `pr-report-tool --repo hooroo/qantas-hotels-ui --author Sharma-IT`
- `pr-report-tool --repo hooroo/qantas-hotels-ui --author Sharma-IT --no-diffs --output ./merged-prs.html`
- `prt --repo hooroo/qantas-hotels-ui --author Sharma-IT --state open`

To remove the global link later:

- `npm unlink -g pr-report-tool`

## Usage

Run via the local CLI wrapper:

- `node ./bin/exportMergedPrHtmlReport.js --repo hooroo/qantas-hotels-ui --author Sharma-IT`

Or via the package script aliases:

- `npm run report -- --repo hooroo/qantas-hotels-ui --author Sharma-IT`
- `npm run report:me -- --repo hooroo/qantas-hotels-ui`
- `npm run report:light -- --repo hooroo/qantas-hotels-ui`
- `npm run report:no-actions -- --repo hooroo/qantas-hotels-ui`
- `npm run report:light:no-actions -- --repo hooroo/qantas-hotels-ui`

If you install the package in a way that exposes its bin entry, you can also run:

- `pr-report-tool --repo hooroo/qantas-hotels-ui --author Sharma-IT`
- `prt --repo hooroo/qantas-hotels-ui --author Sharma-IT --state all`

## Options

- `--author <user>`: GitHub author login to filter by. Defaults to `@me`.
- `--repo <owner/repo>`: repository to query. Recommended when running outside a git checkout.
- `--state <merged|closed|open|all>`: pull request state to fetch. Defaults to `merged`.
- `--limit <count>`: maximum pull requests to fetch. Defaults to `200`.
- `--output <path>`: output HTML path. Defaults to `reports/merged-prs-report.html`.
- `--no-diffs`: skip per-file diff enrichment for a faster lighter report.
- `--no-github-actions-comments`: exclude comments authored by `github-actions`.
- `--help`: print CLI help.

## Example

Generate a light report without GitHub Actions comments:

- `node ./bin/exportMergedPrHtmlReport.js --repo hooroo/qantas-hotels-ui --author Sharma-IT --limit 25 --no-diffs --no-github-actions-comments --output ./reports/Sharma-IT-light.html`

Generate a report for open pull requests via the short alias:

- `prt --repo hooroo/qantas-hotels-ui --author Sharma-IT --state open --limit 25 --output ./reports/Sharma-IT-open.html`

## Output

The generated HTML is self-contained and can be opened directly in a browser or attached to other documentation/workflows.