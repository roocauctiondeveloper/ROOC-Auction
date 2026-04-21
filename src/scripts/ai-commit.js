const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Smart AI-ish Commit Script
 * วิเคราะห์การเปลี่ยนแปลงและสร้าง Commit Message ภาษาไทย
 */

function run(command) {
  try {
    return execSync(command).toString().trim();
  } catch (e) {
    return '';
  }
}

async function start() {
  console.log('🤖 AI Smart Update Starting...');

  // 1. ตรวจสอบการเปลี่ยนแปลง
  const status = run('git status --short');
  if (!status) {
    console.log('ℹ️ ไม่พบการเปลี่ยนแปลงใดๆ');
    process.exit(0);
  }

  // 2. วิเคราะห์ไฟล์ที่เปลี่ยน
  const lines = status.split('\n');
  const files = lines.map(line => line.trim().split(' ').pop());
  
  let summary = '';
  const changes = {
    bot: false,
    web: false,
    db: false,
    config: false,
    other: []
  };

  files.forEach(f => {
    if (f.includes('src/bot')) changes.bot = true;
    else if (f.includes('src/web')) changes.web = true;
    else if (f.includes('src/db')) changes.db = true;
    else if (f.includes('config') || f.includes('.env')) changes.config = true;
    else changes.other.push(path.basename(f));
  });

  // 3. สร้างข้อความภาษาไทย
  const parts = [];
  if (changes.bot) parts.push('ปรับปรุงระบบ Bot (Discord)');
  if (changes.web) parts.push('อัปเดต Dashboard (Web)');
  if (changes.db) parts.push('ปรับแกฐานข้อมูล (Database)');
  if (changes.config) parts.push('แก้ไขการตั้งค่า (Config)');
  
  if (parts.length > 0) {
    summary = parts.join(', ');
  } else if (changes.other.length > 0) {
    summary = `อัปเดตไฟล์: ${changes.other.join(', ')}`;
  } else {
    summary = 'อัปเดตระบบทั่วไป';
  }

  // 4. Bump Version
  console.log('📦 Bumping version...');
  const newVer = run('npm version patch --no-git-tag-version');

  // 5. เตรียม Full Message
  const commitMsg = `feat: ${summary} [${newVer}]`;
  
  console.log(`📝 Commit Message: "${commitMsg}"`);

  // 6. Git Operations
  try {
    run('git add .');
    run(`git commit -m "${commitMsg}"`);
    console.log('📤 Pushing to GitHub...');
    run('git push origin main');
    console.log(`✅ อัปเดตเสร็จสมบูรณ์! (เวอร์ชัน: ${newVer})`);
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาดในการ Git:', err.message);
  }
}

start();
