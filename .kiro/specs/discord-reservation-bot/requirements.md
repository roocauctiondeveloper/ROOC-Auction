# เอกสารความต้องการ (Requirements Document)

## บทนำ

ระบบ Discord Reservation Bot พร้อม Web Dashboard เป็นระบบจองสินค้าที่ทำงานผ่าน Discord Text Channel โดยผู้ใช้สามารถพิมพ์คำสั่งจองสินค้าได้โดยตรงใน Discord และบอทจะตอบกลับผลการจองทันที นอกจากนี้ยังมี Web Dashboard สำหรับผู้ดูแลระบบที่ล็อกอินด้วย Discord User ID เพื่อจัดการหน้า (Page), รายการสินค้า (Item), การจอง, ประวัติการจองในแต่ละรอบ และรายชื่อผู้มีสิทธิ์จอง (Whitelist)

## อภิธานศัพท์ (Glossary)

- **Bot**: Discord Bot ที่รับและประมวลผลคำสั่งจองจากผู้ใช้ใน Text Channel
- **Page**: หน้าของรายการสินค้า แต่ละหน้ามีสินค้าได้สูงสุด 4 ชิ้น
- **Item**: สินค้าหรือรายการที่สามารถจองได้ แต่ละ Item อยู่ในหน้าใดหน้าหนึ่ง และมี ItemType กำกับ
- **ItemType**: ประเภทของ Item มี 3 ค่าที่กำหนดตายตัว ได้แก่ `Album`, `light-dark`, `time-space`
- **Reservation**: การจองสินค้าของผู้ใช้ Discord คนหนึ่งต่อ Item หนึ่งชิ้นหรือทั้งหน้า
- **Round**: รอบการจอง หนึ่งรอบประกอบด้วยชุดข้อมูลการจองทั้งหมดในช่วงเวลานั้น
- **History**: ประวัติการจองทั้งหมดในแต่ละรอบ
- **Admin**: ผู้ดูแลระบบที่มีสิทธิ์เข้าใช้งาน Web Dashboard โดยใช้ Discord User ID
- **Dashboard**: หน้าเว็บสำหรับ Admin จัดการระบบ
- **Discord_User_ID**: รหัสประจำตัวผู้ใช้ Discord ที่ไม่ซ้ำกัน ใช้เป็นตัวระบุตัวตน
- **Discord_Username**: ชื่อผู้ใช้ Discord ที่แสดงใน Text Channel
- **Database**: ฐานข้อมูลที่อยู่ภายในโปรเจ็คสำหรับเก็บข้อมูลทั้งหมด
- **Whitelist**: รายชื่อผู้ใช้ที่ได้รับอนุญาตให้จองAlbumได้ ระบุด้วย Discord_Username เป็นหลัก และรองรับ Discord_User_ID ในอนาคต
- **Preset**: ชุดของ Items ที่กำหนดไว้ล่วงหน้า ระบุจำนวนAlbum, light-dark และtime-space (รวมไม่เกิน 4 ชิ้น) เพื่อใช้ auto-fill เมื่อสร้าง Page ใหม่

---

## ความต้องการ (Requirements)

### ความต้องการที่ 1: การจองสินค้าผ่าน Discord

**User Story:** ในฐานะผู้ใช้ Discord ฉันต้องการพิมพ์คำสั่งจองสินค้าใน Text Channel เพื่อให้ได้รับการยืนยันการจองทันทีโดยไม่ต้องออกจาก Discord โดยAlbumต้องอยู่ใน Whitelist ส่วนขนนกใครก็จองได้

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. WHEN ผู้ใช้พิมพ์คำสั่งจอง Item ที่มี ItemType เป็น `Album`, THE Bot SHALL ตรวจสอบว่า Discord_Username ของผู้ใช้อยู่ใน Whitelist ก่อนดำเนินการจอง
2. IF Discord_Username ของผู้ใช้ไม่อยู่ใน Whitelist และพยายามจอง Item ที่มี ItemType เป็น `Album`, THEN THE Bot SHALL ตอบกลับใน Text Channel ด้วยข้อความแจ้งว่าไม่มีสิทธิ์จองAlbumและไม่บันทึกข้อมูลใดๆ ลง Database
3. WHEN ผู้ใช้พิมพ์คำสั่งจอง Item ที่มี ItemType เป็น `light-dark` หรือ `time-space`, THE Bot SHALL อนุญาตให้จองได้โดยไม่ตรวจสอบ Whitelist
4. WHEN ผู้ใช้พิมพ์คำสั่งจองทั้งหน้า และ Item ทุกชิ้นในหน้านั้นมี ItemType เป็น `light-dark` หรือ `time-space`, THE Bot SHALL ตรวจสอบสถานะของทุก Item ในหน้านั้นและบันทึกการจองเฉพาะ Item ที่ยังว่างอยู่ลง Database โดยไม่ตรวจสอบ Whitelist
5. IF ผู้ใช้พิมพ์คำสั่งจองทั้งหน้าและหน้านั้นมี Item ที่มี ItemType เป็น `Album` อยู่, THEN THE Bot SHALL ตอบกลับใน Text Channel ด้วยข้อความแจ้งว่าหน้านี้มีAlbumซึ่งต้องระบุชิ้นที่ต้องการจองและไม่บันทึกการจองใดๆ
6. WHEN การจอง Item สำเร็จ, THE Bot SHALL ตอบกลับใน Text Channel เดียวกันด้วยข้อความยืนยันการจองสำเร็จพร้อมระบุชื่อผู้จองและรายการที่จอง
7. WHEN Item ที่ต้องการจองถูกจองไปแล้ว, THE Bot SHALL ตอบกลับใน Text Channel เดียวกันด้วยข้อความแจ้งว่า Item นั้นถูกจองแล้วพร้อมระบุ Discord_Username ของผู้ที่จองไว้
8. WHEN ผู้ใช้พิมพ์คำสั่งจองทั้งหน้าและทุก Item ในหน้านั้นถูกจองหมดแล้ว, THE Bot SHALL ตอบกลับใน Text Channel ด้วยข้อความแจ้งว่าทุก Item ในหน้านั้นถูกจองหมดแล้วพร้อมระบุรายชื่อผู้จองแต่ละ Item
9. WHEN ผู้ใช้พิมพ์คำสั่งจองทั้งหน้าและมี Item บางชิ้นว่างและบางชิ้นถูกจองแล้ว, THE Bot SHALL บันทึกการจองเฉพาะ Item ที่ว่างและตอบกลับด้วยสรุปผลการจองแต่ละ Item
10. IF ผู้ใช้ระบุหน้าหรือชิ้นที่ไม่มีอยู่ในระบบ, THEN THE Bot SHALL ตอบกลับใน Text Channel ด้วยข้อความแจ้งว่าไม่พบ Page หรือ Item ที่ระบุ

---

### ความต้องการที่ 2: การจัดการ Page และ Item

**User Story:** ในฐานะ Admin ฉันต้องการจัดการ Page และ Item ผ่าน Web Dashboard เพื่อกำหนดรายการสินค้าที่เปิดให้จองในแต่ละรอบ

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. THE Dashboard SHALL แสดงรายการ Page ทั้งหมดพร้อมจำนวน Item ในแต่ละหน้า
2. WHEN Admin เพิ่ม Page ใหม่, THE Dashboard SHALL บันทึก Page ใหม่ลง Database และแสดงผลทันที
3. WHEN Admin ลบ Page, THE Dashboard SHALL ลบ Page และ Item ทั้งหมดในหน้านั้นออกจาก Database พร้อมยกเลิก Reservation ที่เกี่ยวข้อง
4. THE Dashboard SHALL แสดงรายการ Item ทั้งหมดในแต่ละ Page พร้อมสถานะการจองและ ItemType
5. WHEN Admin เพิ่ม Item ใน Page ที่มี Item น้อยกว่า 4 ชิ้น, THE Dashboard SHALL บันทึก Item ใหม่พร้อม ItemType ที่ระบุลง Database และแสดงผลทันที
6. IF Admin พยายามเพิ่ม Item ใน Page ที่มี Item ครบ 4 ชิ้นแล้ว, THEN THE Dashboard SHALL แสดงข้อความแจ้งเตือนว่าหน้านั้นเต็มแล้วและไม่บันทึกข้อมูล
7. WHEN Admin ลบ Item, THE Dashboard SHALL ลบ Item และ Reservation ที่เกี่ยวข้องออกจาก Database และแสดงผลทันที
8. IF Admin พยายามเพิ่ม Item โดยไม่ระบุ ItemType หรือระบุ ItemType ที่ไม่ถูกต้อง, THEN THE Dashboard SHALL แสดงข้อความแจ้งเตือนและไม่บันทึกข้อมูล

---

### ความต้องการที่ 3: การจัดการ Reservation ผ่าน Dashboard

**User Story:** ในฐานะ Admin ฉันต้องการเพิ่มและลบรายการจองผ่าน Web Dashboard เพื่อแก้ไขข้อมูลการจองที่ผิดพลาดหรือจัดการแทนผู้ใช้

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. THE Dashboard SHALL แสดงรายการ Reservation ทั้งหมดในรอบปัจจุบัน พร้อม Discord_Username, Page, Item และ ItemType ที่จอง
2. WHEN Admin เพิ่ม Reservation สำหรับ Item ที่ว่างอยู่, THE Dashboard SHALL บันทึก Reservation ลง Database และอัปเดตสถานะ Item เป็นถูกจองแล้ว
3. IF Admin พยายามเพิ่ม Reservation สำหรับ Item ที่ถูกจองแล้ว, THEN THE Dashboard SHALL แสดงข้อความแจ้งเตือนว่า Item นั้นถูกจองแล้วและไม่บันทึกข้อมูล
4. WHEN Admin ลบ Reservation, THE Dashboard SHALL ลบ Reservation ออกจาก Database และอัปเดตสถานะ Item กลับเป็นว่าง
5. THE Dashboard SHALL แสดงสถานะ Item แบบ real-time หลังจากมีการเปลี่ยนแปลงข้อมูล

---

### ความต้องการที่ 4: ระบบ History และการจัดการรอบ

**User Story:** ในฐานะ Admin ฉันต้องการดูประวัติการจองในแต่ละรอบและลบ History ได้ เพื่อติดตามข้อมูลและล้างข้อมูลทดสอบออก

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. THE Database SHALL บันทึก Reservation ทุกรายการพร้อม timestamp, Discord_User_ID, Discord_Username, Page, Item, ItemType และ Round ที่เกี่ยวข้อง
2. THE Dashboard SHALL แสดง History การจองแยกตาม Round พร้อมวันที่และเวลา
3. WHEN Admin ลบ History ของ Round ใด, THE Dashboard SHALL ลบข้อมูล Reservation ทั้งหมดของ Round นั้นออกจาก Database
4. WHEN Admin ลบ History ทั้งหมด, THE Dashboard SHALL ลบข้อมูล Reservation ทุก Round ออกจาก Database
5. THE Dashboard SHALL แสดงจำนวน Reservation ทั้งหมดในแต่ละ Round

---

### ความต้องการที่ 5: ระบบ Authentication สำหรับ Admin

**User Story:** ในฐานะ Admin ฉันต้องการล็อกอินเข้า Web Dashboard ด้วย Discord User ID เพื่อให้มั่นใจว่าเฉพาะผู้ที่ได้รับอนุญาตเท่านั้นที่เข้าถึงระบบจัดการได้

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. THE Dashboard SHALL แสดงหน้า Login ที่ต้องการ Discord User ID ก่อนเข้าถึงฟังก์ชันใดๆ
2. WHEN ผู้ใช้กรอก Discord User ID ที่ได้รับอนุญาต, THE Dashboard SHALL อนุญาตให้เข้าถึงหน้าจัดการและสร้าง Session
3. IF ผู้ใช้กรอก Discord User ID ที่ไม่ได้รับอนุญาต, THEN THE Dashboard SHALL แสดงข้อความแจ้งว่าไม่มีสิทธิ์เข้าถึงและไม่สร้าง Session
4. WHILE Admin ล็อกอินอยู่, THE Dashboard SHALL รักษา Session ให้คงอยู่ตลอดการใช้งาน
5. WHEN Admin กดออกจากระบบ, THE Dashboard SHALL ยกเลิก Session และเปลี่ยนเส้นทางไปหน้า Login
6. THE System SHALL เก็บรายการ Discord User ID ที่ได้รับอนุญาตใน Database เพื่อให้สามารถเพิ่มหรือลบสิทธิ์ได้

---

### ความต้องการที่ 6: ระบบ Database ภายในโปรเจ็ค

**User Story:** ในฐานะนักพัฒนา ฉันต้องการให้ระบบมี Database อยู่ภายในโปรเจ็คเพื่อให้ Deploy ได้ง่ายและไม่ต้องพึ่งพาบริการภายนอก

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. THE Database SHALL เก็บข้อมูล Page, Item, Reservation, Round, History, Admin User และ Whitelist ทั้งหมดในไฟล์ฐานข้อมูลที่อยู่ภายในโปรเจ็ค
2. THE System SHALL รองรับการทำงานพร้อมกันของ Bot และ Dashboard โดยไม่เกิดข้อมูลขัดแย้งกัน (data conflict)
3. WHEN ระบบเริ่มทำงานครั้งแรก, THE System SHALL สร้างโครงสร้าง Database อัตโนมัติหากยังไม่มีอยู่
4. THE Database SHALL รองรับการ Query ข้อมูล Reservation ตาม Round, Page, Item และ Discord_User_ID

---

### ความต้องการที่ 7: การ Deploy บน Server

**User Story:** ในฐานะผู้ดูแลระบบ ฉันต้องการ Deploy ระบบทั้งหมดบน Server เพื่อให้ Bot และ Dashboard ทำงานได้ตลอดเวลา

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. THE System SHALL รองรับการ Deploy แบบ Server-Side Rendering สำหรับ Web Dashboard
2. THE System SHALL ให้ Bot และ Dashboard ทำงานในกระบวนการเดียวกันและ Start พร้อมกันด้วยคำสั่งเดียว
3. THE System SHALL มีไฟล์ configuration สำหรับตั้งค่า Discord Bot Token, Discord Guild ID และ Port ของ Web Server
4. WHEN ระบบได้รับ environment variables ที่จำเป็น, THE System SHALL เริ่มทำงานทั้ง Bot และ Dashboard พร้อมกัน
5. IF environment variables ที่จำเป็นไม่ครบ, THEN THE System SHALL แสดงข้อความแจ้งว่า configuration ใดที่ขาดหายไปและหยุดการทำงาน

---

### ความต้องการที่ 8: ประเภท Item และกฎการจองตามประเภท

**User Story:** ในฐานะผู้ใช้ Discord ฉันต้องการให้ระบบบังคับใช้กฎการจองตามประเภทของ Item เพื่อให้การจองเป็นไปตามข้อกำหนดของแต่ละประเภทสินค้า

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. THE System SHALL รองรับ ItemType เพียง 3 ค่าเท่านั้น ได้แก่ `Album`, `light-dark` และ `time-space`
2. WHEN Admin เพิ่ม Item, THE Dashboard SHALL บังคับให้ระบุ ItemType จาก 3 ค่าที่กำหนดไว้เท่านั้น
3. WHEN ผู้ใช้พิมพ์คำสั่งจองทั้งหน้า และหน้านั้นมี Item ที่มี ItemType เป็น `light-dark` หรือ `time-space` ทั้งหมด, THE Bot SHALL อนุญาตให้จองทั้งหน้าได้
4. IF ผู้ใช้พิมพ์คำสั่งจองทั้งหน้า และหน้านั้นมี Item อย่างน้อย 1 ชิ้นที่มี ItemType เป็น `Album`, THEN THE Bot SHALL ปฏิเสธการจองทั้งหน้าและแจ้งให้ผู้ใช้ระบุชิ้นที่ต้องการจอง
5. WHEN ผู้ใช้พิมพ์คำสั่งจองระบุชิ้น, THE Bot SHALL อนุญาตให้จองได้โดยไม่คำนึงถึง ItemType ของ Item นั้น
6. THE Database SHALL บันทึก ItemType ของแต่ละ Item และไม่อนุญาตให้ค่า ItemType เป็น NULL

---

### ความต้องการที่ 10: คำสั่ง /available — ดูรายการที่ว่างและจองได้เลย

**User Story:** ในฐานะผู้ใช้ Discord ฉันต้องการดูรายการ Page และ Item ที่ยังว่างอยู่ในรอบปัจจุบัน และสามารถกดจองได้เลยโดยไม่ต้องพิมพ์คำสั่งใหม่

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. WHEN ผู้ใช้พิมพ์คำสั่ง `/available`, THE Bot SHALL ดึงรายการ Page และ Item ที่ยังว่างอยู่ในรอบปัจจุบันจาก Database และแสดงเป็น Discord Embed
2. WHEN มี Item ว่างอยู่, THE Bot SHALL แสดง interactive components (Buttons หรือ Select Menu) ให้ผู้ใช้กดเลือก Item ที่ต้องการจองได้เลยโดยไม่ต้องพิมพ์คำสั่งใหม่
3. IF ไม่มี Item ว่างเลยในรอบปัจจุบัน, THEN THE Bot SHALL ตอบกลับด้วยข้อความแจ้งว่าทุก Item ถูกจองหมดแล้ว
4. WHEN ผู้ใช้กดปุ่มหรือเลือก Item จาก interactive component, THE Bot SHALL ตรวจสอบว่า Discord_Username ของผู้ใช้อยู่ใน Whitelist ก่อนดำเนินการจอง
5. IF Discord_Username ของผู้ใช้ไม่อยู่ใน Whitelist และกดจองจาก interactive component, THEN THE Bot SHALL ตอบกลับด้วยข้อความแจ้งว่าไม่มีสิทธิ์จองและไม่บันทึกข้อมูลใดๆ
6. WHEN ผู้ใช้ที่อยู่ใน Whitelist กดจอง Item จาก interactive component, THE Bot SHALL บันทึกการจองลง Database และตอบกลับผลการจองทันที
7. IF Item ที่ผู้ใช้เลือกถูกจองไปแล้วก่อนที่จะกดปุ่ม (race condition), THEN THE Bot SHALL ตอบกลับด้วยข้อความแจ้งว่า Item นั้นถูกจองแล้วและไม่บันทึกข้อมูลซ้ำ
8. THE Bot SHALL ตอบกลับผลการจองจาก interactive component เป็น ephemeral message หรือข้อความใน channel เดียวกัน

---

### ความต้องการที่ 11: คำสั่ง /mystuff — ดูของที่ตัวเองจองไปแล้ว

**User Story:** ในฐานะผู้ใช้ Discord ฉันต้องการดูรายการ Item ทั้งหมดที่ฉันจองไว้ในรอบปัจจุบัน เพื่อตรวจสอบการจองของตัวเอง

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. WHEN ผู้ใช้พิมพ์คำสั่ง `/mystuff`, THE Bot SHALL ดึงรายการ Item ทั้งหมดที่ผู้ใช้คนนั้นจองไว้ในรอบปัจจุบันจาก Database โดยระบุด้วย Discord_Username
2. WHEN ผู้ใช้มีการจองอยู่, THE Bot SHALL แสดงรายการ Item ที่จองพร้อม Page name, Item name และ ItemType ของแต่ละรายการ
3. IF ผู้ใช้ยังไม่ได้จองอะไรเลยในรอบปัจจุบัน, THEN THE Bot SHALL ตอบกลับด้วยข้อความแจ้งว่ายังไม่มีการจองในรอบนี้
4. THE Bot SHALL ตอบกลับคำสั่ง `/mystuff` เป็น ephemeral message เพื่อให้เห็นเฉพาะผู้ที่ใช้คำสั่งเท่านั้น

---

### ความต้องการที่ 9: ระบบ Whitelist ผู้มีสิทธิ์จอง

**User Story:** ในฐานะ Admin ฉันต้องการจัดการรายชื่อผู้มีสิทธิ์จองAlbumผ่าน Dashboard เพื่อควบคุมว่าใครสามารถจองAlbumได้บ้าง ส่วนlight-darkและtime-spaceเปิดให้ทุกคนจองได้

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. THE Dashboard SHALL แสดงรายชื่อทั้งหมดใน Whitelist พร้อม Discord_Username และ Discord_User_ID (ถ้ามี)
2. WHEN Admin เพิ่มรายชื่อใน Whitelist โดยระบุ Discord_Username, THE Dashboard SHALL บันทึกรายชื่อนั้นลง Database และแสดงผลทันที
3. WHEN Admin ลบรายชื่อออกจาก Whitelist, THE Dashboard SHALL ลบรายชื่อนั้นออกจาก Database และแสดงผลทันที
4. THE System SHALL รองรับการเก็บ field `discord_user_id` ใน Whitelist เพื่อรองรับการเปลี่ยนมาใช้ ID เป็น identifier ในอนาคต โดย field นี้เป็น optional ในปัจจุบัน
5. IF Admin พยายามเพิ่มรายชื่อที่มีอยู่ใน Whitelist แล้ว, THEN THE Dashboard SHALL แสดงข้อความแจ้งเตือนว่ารายชื่อนั้นมีอยู่แล้วและไม่บันทึกข้อมูลซ้ำ
6. WHEN Bot ได้รับคำสั่งจอง Item ที่มี ItemType เป็น `Album`, THE Bot SHALL ตรวจสอบ Discord_Username ของผู้ส่งคำสั่งกับรายชื่อใน Whitelist ก่อนดำเนินการจอง
7. WHEN Bot ได้รับคำสั่งจอง Item ที่มี ItemType เป็น `light-dark` หรือ `time-space`, THE Bot SHALL ไม่ตรวจสอบ Whitelist และอนุญาตให้จองได้ทันที

---

### ความต้องการที่ 12: กฎ Whitelist เฉพาะAlbum

**User Story:** ในฐานะผู้ใช้ Discord ฉันต้องการจองlight-darkและtime-spaceได้โดยไม่ต้องอยู่ใน Whitelist เพื่อให้การจองขนนกเป็นไปอย่างเสรี ในขณะที่Albumยังคงต้องตรวจสอบสิทธิ์

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. WHEN ผู้ใช้พิมพ์คำสั่งจอง Item ที่มี ItemType เป็น `light-dark` หรือ `time-space`, THE Bot SHALL อนุญาตให้จองได้ทันทีโดยไม่ตรวจสอบ Whitelist
2. WHEN ผู้ใช้พิมพ์คำสั่งจอง Item ที่มี ItemType เป็น `Album`, THE Bot SHALL ตรวจสอบ Whitelist ก่อนดำเนินการจอง
3. IF ผู้ใช้ไม่อยู่ใน Whitelist และพยายามจอง `Album`, THEN THE Bot SHALL ปฏิเสธการจองและไม่บันทึกข้อมูลใดๆ
4. WHEN ผู้ใช้กดจอง Item จาก `/available` interactive component และ Item นั้นมี ItemType เป็น `light-dark` หรือ `time-space`, THE Bot SHALL อนุญาตให้จองได้ทันทีโดยไม่ตรวจสอบ Whitelist
5. WHEN ผู้ใช้กดจอง Item จาก `/available` interactive component และ Item นั้นมี ItemType เป็น `Album`, THE Bot SHALL ตรวจสอบ Whitelist ก่อนดำเนินการจอง
6. IF ผู้ใช้ไม่อยู่ใน Whitelist และกดจอง `Album` จาก `/available`, THEN THE Bot SHALL ตอบกลับ ephemeral message แจ้งว่าไม่มีสิทธิ์จองAlbumและไม่บันทึกข้อมูลใดๆ

---

### ความต้องการที่ 13: ระบบ Preset Items สำหรับการเพิ่ม Items ในรอบใหม่

**User Story:** ในฐานะ Admin ฉันต้องการสร้าง Preset ของ Items ที่ใช้บ่อย เพื่อให้สามารถ auto-fill Items เมื่อสร้าง Page ใหม่ได้อย่างรวดเร็ว แทนที่จะต้องเพิ่มทีละชิ้นทุกครั้ง

#### เกณฑ์การยอมรับ (Acceptance Criteria)

1. THE Dashboard SHALL แสดงรายการ Preset ทั้งหมดพร้อมชื่อ Preset และจำนวน Items แต่ละประเภท (Album, light-dark, time-space)
2. WHEN Admin สร้าง Preset ใหม่, THE Dashboard SHALL บันทึก Preset พร้อมชื่อและจำนวน Items แต่ละประเภทลง Database และแสดงผลทันที
3. THE System SHALL บังคับให้ผลรวมของ Items ใน Preset ไม่เกิน 4 ชิ้น (Album + light-dark + time-space ≤ 4)
4. IF Admin พยายามสร้าง Preset ที่มีผลรวม Items เกิน 4 ชิ้น, THEN THE Dashboard SHALL แสดงข้อความแจ้งเตือนและไม่บันทึกข้อมูล
5. WHEN Admin แก้ไข Preset, THE Dashboard SHALL อัปเดตข้อมูล Preset ใน Database และแสดงผลทันที
6. WHEN Admin ลบ Preset, THE Dashboard SHALL ลบ Preset นั้นออกจาก Database และแสดงผลทันที
7. WHEN Admin สร้าง Page ใหม่, THE Dashboard SHALL แสดง dropdown ให้เลือก Preset (optional) เพื่อ auto-fill Items
8. WHEN Admin เลือก Preset ตอนสร้าง Page ใหม่, THE Dashboard SHALL สร้าง Page และเพิ่ม Items ตามจำนวนที่กำหนดใน Preset ลง Database ในคราวเดียว
9. WHEN Admin ไม่เลือก Preset ตอนสร้าง Page ใหม่, THE Dashboard SHALL สร้าง Page เปล่าและ Admin สามารถเพิ่ม Item ทีละชิ้นแบบเดิมได้
10. THE System SHALL รองรับการสร้าง Preset ที่มีจำนวน Items เป็น 0 สำหรับบางประเภทได้ (เช่น Preset ที่มีแค่light-dark 2 ชิ้น โดยไม่มีAlbumหรือtime-space)
11. IF ชื่อ Preset ซ้ำกับที่มีอยู่แล้ว, THEN THE Dashboard SHALL แสดงข้อความแจ้งเตือนและไม่บันทึกข้อมูลซ้ำ
