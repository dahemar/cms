#!/usr/bin/env node
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const siteId = process.argv[2] || 3;
(async ()=>{
  try{
    console.log(`Listing posts for site ${siteId} (published=true)`);
    const posts = await prisma.post.findMany({
      where: { siteId: Number(siteId) },
      include: { blocks: true, section: true },
      orderBy: { updatedAt: 'desc' }
    });
    console.log(`Found ${posts.length} posts`);
    posts.forEach(p=>{
      console.log('---');
      console.log('id:', p.id, 'slug:', p.slug, 'title:', p.title);
      console.log('published:', p.published, 'sectionId:', p.sectionId, 'sectionSlug:', p.section?.slug || null);
      console.log('updatedAt:', p.updatedAt);
      console.log('blocksCount:', Array.isArray(p.blocks)?p.blocks.length:0);
    });
    process.exit(0);
  }catch(e){
    console.error('ERROR', e.message);
    console.error(e.stack);
    process.exit(2);
  }finally{
    await prisma.$disconnect();
  }
})();
