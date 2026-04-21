# ใช้ Node.js 20 เป็นฐาน
FROM node:20-slim

# สร้างโฟลเดอร์สำหรับแอป
WORKDIR /app

# คัดลอกไฟล์ package.json และ package-lock.json (ถ้ามี)
COPY package*.json ./

# ติดตั้งเฉพาะ production dependencies เพื่อความรวดเร็วและใช้พื้นที่น้อย
RUN npm install --production

# คัดลอกโค้ดทั้งหมด (ยกเว้นที่ระบุใน .dockerignore)
COPY . .

# กำหนดพอร์ต 7860 ตามมาตรฐาน Hugging Face Spaces
ENV PORT=7860
EXPOSE 7860

# สั่งรันแอป
CMD ["npm", "start"]
