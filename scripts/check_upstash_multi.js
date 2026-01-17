const fs = require('fs');
const path = require('path');

function loadEnv(envPath){
  const txt = fs.readFileSync(envPath, 'utf8');
  const lines = txt.split(/\r?\n/);
  const out = {};
  for(const l of lines){
    const m = l.match(/^([A-Z0-9_]+)=(?:"([\s\S]*)"|([^#]*))/);
    if(m){
      const key = m[1];
      const val = (m[2] !== undefined ? m[2] : (m[3]||'')).trim();
      out[key] = val.replace(/\\n$/, '').replace(/\\r$/, '');
    }
  }
  return out;
}

async function main(){
  try{
    const repo = process.cwd();
    const envPath = path.join(repo, '.env');
    if(!fs.existsSync(envPath)){
      console.error('.env not found at', envPath);
      process.exit(2);
    }
    const env = loadEnv(envPath);
    const URL = env.UPSTASH_REDIS_REST_URL;
    const TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
    const REDIS_URL = env.REDIS_URL;
    console.log('UPSTASH_REDIS_REST_URL =', URL);
    console.log('REDIS_URL =', REDIS_URL);
    if(!URL || !TOKEN){
      console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in .env');
      process.exit(3);
    }

    const headers = { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
    const call = async (cmdArray) => {
      const body = JSON.stringify(cmdArray);
      const res = await fetch(URL, { method: 'POST', headers, body });
      const txt = await res.text();
      try{ return JSON.parse(txt); } catch(e){ return txt; }
    };

    const patterns = ['posts:*', 'sections:*', 'thumbnails:*', '*posts*'];

    for(const pattern of patterns){
      console.log('\n=== PATTERN =>', pattern, '===');
      const scan = await call(['SCAN','0','MATCH',pattern,'COUNT','1000']);
      console.log('RAW SCAN RESPONSE:', JSON.stringify(scan));
      let keys = [];
      if(Array.isArray(scan) && scan.length>1 && Array.isArray(scan[1])) keys = scan[1];
      if(keys.length===0){
        console.log('No keys matching', pattern);
        continue;
      }
      console.log('Found', keys.length, 'keys');
      for(const k of keys){
        const ttl = await call(['TTL', k]);
        const type = await call(['TYPE', k]);
        const strlen = await call(['STRLEN', k]);
        console.log('\nKey:', k);
        console.log('  TTL:', ttl);
        console.log('  TYPE:', type);
        console.log('  STRLEN:', strlen);
      }
    }

  }catch(err){
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
