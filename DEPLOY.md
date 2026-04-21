# 🚀 คู่มือการอัปเดตระบบ (Deployment Guide)

### 1. การเตรียมตัวครั้งแรก (ทำครั้งเดียว)
หากยังไม่ได้เพิ่ม Remote ของ Hugging Face ให้ทำดังนี้:
```bash
git remote add hf https://huggingface.co/spaces/roocaution/rooc-auction-bot
```

### 2. วิธีอัปเดตโค้ด (หลังจากแก้ไขงานเสร็จ)
ให้รันคำสั่งตามลำดับนี้ใน Terminal:

```bash
# 1. เตรียมไฟล์
git add .

# 2. บันทึกประวัติ
git commit -m "ใส่ข้อความอธิบายการแก้ไขที่นี่"

# 3. ส่งขึ้น GitHub และ Hugging Face พร้อมกัน
npm run push-all
```

---

### 💡 คำสั่งอื่นๆ ที่ควรรู้
*   `npm run push-hf`: ส่งขึ้น Hugging Face อย่างเดียว (เพื่ออัปเดตบอท)
*   `npm run push-github`: ส่งขึ้น GitHub อย่างเดียว (เพื่อสำรองโค้ด)
*   **รหัสผ่าน**: เมื่อระบบถาม Password ของ Hugging Face ให้ใช้ **Access Token (hf_...)** แทนรหัสผ่านปกติ

### 🛠️ ลิงก์ที่เกี่ยวข้อง
*   **GitHub**: [roocauctiondeveloper/ROOC-Auction](https://github.com/roocauctiondeveloper/ROOC-Auction)
*   **Hugging Face Space**: [roocaution/rooc-auction-bot](https://huggingface.co/spaces/roocaution/rooc-auction-bot)
*   **HF Settings (เพื่อดู Log/Secrets)**: [Settings Link](https://huggingface.co/spaces/roocaution/rooc-auction-bot/settings)
