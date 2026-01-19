#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
(async () => {
  try {
    const ga = require('./github-app');
    const token = await ga.getInstallationToken();
    const owner = 'dahemar';
    const repo = 'cineclub';

    console.log('Fetching recent runs for', `${owner}/${repo}`);
    const runsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=20`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'CMS-Action-Checker' }
    });
    const runsJson = await runsRes.json();
    if (!runsJson.workflow_runs || runsJson.workflow_runs.length === 0) {
      console.log('No runs found');
      process.exit(0);
    }

    const failedRun = runsJson.workflow_runs.find(r => r.conclusion === 'failure' || r.conclusion === 'cancelled' || (r.status === 'completed' && r.conclusion !== 'success')) || runsJson.workflow_runs[0];
    const runId = failedRun.id;
    console.log('Selected run:', runId, 'created_at:', failedRun.created_at, 'conclusion:', failedRun.conclusion);

    // Get jobs to identify failed jobs
    const jobsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'CMS-Action-Checker' }
    });
    const jobsJson = await jobsRes.json();
    const jobs = jobsJson.jobs || [];

    if (jobs.length === 0) {
      console.log('No jobs found for run', runId);
    } else {
      console.log('Jobs:');
      jobs.forEach(j => {
        console.log(` - ${j.name} | status=${j.status} | conclusion=${j.conclusion} | id=${j.id}`);
      });
    }

    // Download logs zip
    const zipPath = path.resolve('/tmp', `cineclub-run-${runId}-logs.zip`);
    console.log('Downloading logs to', zipPath);
    const zipRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/logs`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'CMS-Action-Checker' }
    });
    if (!zipRes.ok) {
      const txt = await zipRes.text();
      console.error('Failed to download logs:', zipRes.status, txt.slice(0,1000));
      process.exit(2);
    }

    const buffer = await zipRes.arrayBuffer();
    fs.writeFileSync(zipPath, Buffer.from(buffer));

    const outDir = path.resolve('/tmp', `cineclub-run-${runId}-logs`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // Unzip
    try {
      execSync(`unzip -o ${zipPath} -d ${outDir}`);
    } catch (e) {
      // unzip may return non-zero but still extract; ignore
    }

    console.log('Unzipped to', outDir);

    // Find files for failed jobs and print last 400 lines
    const failedJobs = jobs.filter(j => j.conclusion !== 'success');
    if (failedJobs.length === 0) {
      console.log('No failed jobs in this run. Showing last 1 log file as sample.');
      // list files
      const files = fs.readdirSync(outDir).filter(f => f.endsWith('.txt'));
      if (files.length === 0) {
        console.log('No log files extracted.');
        process.exit(0);
      }
      const sample = path.join(outDir, files[0]);
      console.log('--- TAIL', sample, '---');
      const tail = execSync(`tail -n 400 ${sample}`).toString();
      console.log(tail);
      process.exit(0);
    }

    for (const job of failedJobs) {
      // job name may correspond to a directory/file prefix; search files containing job name
      const files = fs.readdirSync(outDir);
      const matching = files.filter(f => f.toLowerCase().includes(String(job.id)) || f.toLowerCase().includes(job.name.toLowerCase().replace(/\s+/g,'-')) || f.toLowerCase().includes(job.name.toLowerCase().replace(/\s+/g,'_')));
      console.log('\n=== Failed job:', job.name, 'id=', job.id, 'matches files:', matching.length, '===');
      if (matching.length === 0) {
        // fallback: list all files and show those containing job.id
        const byId = files.filter(f => f.includes(String(job.id)));
        if (byId.length > 0) {
          for (const mf of byId) {
            const mfPath = path.join(outDir, mf);
            console.log('--- TAIL', mfPath, '---');
            console.log(execSync(`tail -n 400 ${mfPath}`).toString());
          }
        } else {
          console.log('No matching log files for job. Available files:', files.slice(0,20));
        }
      } else {
        for (const mf of matching) {
          const mfPath = path.join(outDir, mf);
          console.log('--- TAIL', mfPath, '---');
          console.log(execSync(`tail -n 400 ${mfPath}`).toString());
        }
      }
    }

  } catch (e) {
    console.error('ERROR', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
