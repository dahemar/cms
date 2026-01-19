#!/usr/bin/env node
require('dotenv').config();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  try {
    const ga = require('./github-app');
    const owner = 'dahemar';
    const repo = 'cineclub';

    const token = await ga.getInstallationToken();

    // Get latest run for branch main
    const runsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=5`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'CMS-Action-Watcher' }
    });
    const runsJson = await runsRes.json();
    if (!runsJson.workflow_runs || runsJson.workflow_runs.length === 0) {
      console.log('No workflow runs found for', `${owner}/${repo}`);
      process.exit(0);
    }

    // Choose the most recent run on main branch
    const run = runsJson.workflow_runs.find(r => r.head_branch === 'main') || runsJson.workflow_runs[0];
    const runId = run.id;
    console.log('Watching run:', runId, run.html_url, 'initial status:', run.status, 'conclusion:', run.conclusion);

    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    const start = Date.now();

    while (true) {
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'CMS-Action-Watcher' }
      });
      const jr = await r.json();
      const status = jr.status;
      const conclusion = jr.conclusion;
      console.log(new Date().toISOString(), 'status=', status, 'conclusion=', conclusion || 'N/A');
      if (status === 'completed') {
        console.log('Run finished:', jr.html_url, 'conclusion=', conclusion);
        // fetch jobs summary
        const jobsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'CMS-Action-Watcher' }
        });
        const jobsJson = await jobsRes.json();
        const jobs = jobsJson.jobs || [];
        console.log('Jobs summary:');
        jobs.forEach(j => console.log(` - ${j.name} | status=${j.status} | conclusion=${j.conclusion}`));
        process.exit(0);
      }
      if (Date.now() - start > timeoutMs) {
        console.log('Timeout reached waiting for run to complete. Last status:', status);
        process.exit(2);
      }
      await sleep(5000);
    }
  } catch (e) {
    console.error('ERROR', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
