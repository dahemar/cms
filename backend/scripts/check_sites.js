#!/usr/bin/env node
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async ()=>{
  try{
    console.log('Connecting, fetching sites...');
    const sites = await prisma.site.findMany({ include: { config: true }, orderBy:{ createdAt: 'asc' } });
    console.log('Got', sites.length, 'sites');
    sites.forEach(s=> console.log(s.id, s.name, s.slug, s.githubRepo));
    process.exit(0);
  }catch(e){
    console.error('ERROR:', e);
    if(e.message) console.error('MSG:', e.message);
    process.exit(2);
  }finally{
    await prisma.$disconnect();
  }
})();