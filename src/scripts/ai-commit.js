const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * AI-Powered Deep Analysis Commit Script
 * วิเคราะห์ความเปลี่ยนแปลงเชิงลึกในระดับบรรทัดและสร้าง Commit Message ที่ละเอียด
 */

function run(command) {
  try {
    return execSync(command).toString().trim();
  } catch (e) {
    return '';
  }
}

async function start() {
  console.log('🧠 AI Deep Analysis Starting...');

  // 1. ตรวจสอบการเปลี่ยนแปลง
  const status = run('git status --short');
  if (!status) {
      console.log('ℹ️ ไม่พบการเปลี่ยนแปลงใดๆ');
      process.exit(0);
  }

  // 2. วิเคราะห์ Diff เชิงลึก
  run('git add .');
  const fullDiff = run('git diff --cached');
  const diffLines = fullDiff.split('\n');

  const analysis = {
    features: [],
    ui: [],
    fixes: [],
    db: [],
    refactor: []
  };

  // Logic ในการแกะรอยการเปลี่ยนแปลง
  let currentFile = '';
  diffLines.forEach(line => {
    if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
      currentFile = line.split('/').pop();
    }
    
    // วิเคราะห์บรรทัดที่เพิ่ม (+)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.substring(1).trim();
      
      // หมวดหมู่: Database
      if (content.match(/ALTER TABLE|CREATE TABLE|ADD COLUMN|db\.exec/i)) {
        analysis.db.push(`ระเบียบฐานข้อมูลใน ${currentFile}`);
      }
      // หมวดหมู่: Features
      else if (content.match(/async function|function|router\.post|router\.get/i)) {
        const match = content.match(/(function|router\.(post|get))\s+([a-zA-Z0-9_\/:]+)/);
        const name = match ? match[3] : 'ใหม่';
        analysis.features.push(`เพิ่มฟังก์ชัน ${name} ใน ${currentFile}`);
      }
      // หมวดหมู่: UI/UX
      else if (content.match(/style=|class=|color:|ctx\.|ICONS|badge|🕊️|🐓|📒/i)) {
        if (!analysis.ui.includes(`ปรับปรุงส่วนติดต่อผู้ใช้ (${currentFile})`)) {
            analysis.ui.push(`ปรับปรุงส่วนติดต่อผู้ใช้ (${currentFile})`);
        }
      }
      // หมวดหมู่: Fixes/Logic
      else if (content.match(/try\s*\{|if\s*\(|catch\s*\(|else/i)) {
        analysis.fixes.push(`ปรับแก้ Logic การทำงานใน ${currentFile}`);
      }
    }
  });

  // กำจัดตัวซ้ำและสรุปความ
  const uniqueFeatures = [...new Set(analysis.features)].slice(0, 2);
  const uniqueUI = [...new Set(analysis.ui)].slice(0, 2);
  const uniqueDB = [...new Set(analysis.db)].slice(0, 2);
  
  // 3. สร้าง Message แบบ AI Think
  let summary = '';
  if (uniqueFeatures.length > 0) summary += uniqueFeatures.join(', ');
  else if (uniqueUI.length > 0) summary += uniqueUI.join(', ');
  else if (uniqueDB.length > 0) summary += uniqueDB.join(', ');
  else summary += 'อัปเดตระบบและไฟล์ทั่วไป';

  // 4. Bump Version
  console.log('📦 Bumping version...');
  const newVer = run('npm version patch --no-git-tag-version');

  // 5. เตรียม Full Message (แบบละเอียดมาก)
  const commitTitle = `feat: ${summary} [${newVer}]`;
  
  // สร้างรายการการเปลี่ยนแปลงสำหรับ Body
  let commitBody = '\n\n📜 Detailed Changes:';
  if (analysis.features.length > 0) commitBody += `\n🚀 Features:\n- ${[...new Set(analysis.features)].join('\n- ')}`;
  if (analysis.ui.length > 0) commitBody += `\n🎨 UI/UX:\n- ${[...new Set(analysis.ui)].join('\n- ')}`;
  if (analysis.db.length > 0) commitBody += `\n🛠️ Database:\n- ${[...new Set(analysis.db)].join('\n- ')}`;
  if (analysis.fixes.length > 0) commitBody += `\n🔧 Logic/Refactor:\n- ${[...new Set(analysis.fixes)].slice(0, 5).join('\n- ')}`;

  console.log('-----------------------------------');
  console.log(`📝 Commit Header: ${commitTitle}`);
  console.log(`📝 Commit Details: ${commitBody}`);
  console.log('-----------------------------------');

  // 6. Git Operations
  try {
    // ต้อง Escaping double quotes สำหรับ Windows
    const finalTitle = commitTitle.replace(/"/g, '\\"');
    const finalBody = commitBody.replace(/"/g, '\\"');

    run(`git commit -m "${finalTitle}" -m "${finalBody}"`);
    console.log('📤 Pushing to GitHub...');
    run('git push origin main');
    console.log(`✅ อัปเดตเสร็จสมบูรณ์! ระบบสรุปการเปลี่ยนแปลงให้เรียบร้อย (V: ${newVer})`);
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาดในการ Git:', err.message);
  }
}

start();
