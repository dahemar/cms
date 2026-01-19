#!/usr/bin/env node
require('dotenv').config();
(async () => {
  try {
    const ga = require('./github-app');
    const repos = (process.env.GITHUB_FRONTEND_REPOS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (repos.length === 0) {
      console.error('No repos configured in GITHUB_FRONTEND_REPOS');
      process.exit(1);
    }

    const token = await ga.getInstallationToken();

    for (const r of repos) {
      const [owner, repo] = r.split('/');
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=6`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'CMS-Action-Checker'
        }
      });

      const data = await res.json();
      console.log(`\n=== ${r} STATUS ${res.status} ===`);
      if (res.status !== 200) {
        console.log(JSON.stringify(data, null, 2).slice(0, 2000));
        continue;
      }

      if (!data.workflow_runs || data.workflow_runs.length === 0) {
        console.log('No workflow runs found');
        continue;
      }

      data.workflow_runs.slice(0, 6).forEach(w => {
        console.log(`${w.name || ('workflow_id:' + w.workflow_id)} | status=${w.status} | conclusion=${w.conclusion} | url=${w.html_url} | created_at=${w.created_at}`);
      });
    }
  } catch (e) {
    console.error('ERR', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
