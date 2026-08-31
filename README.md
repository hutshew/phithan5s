# phithan5s

ระบบตรวจรายงานและประเมิณ 5 ส สำหรับบันทึกผลตรวจรายเดือน แยกสาขา/แผนก จัดการ Template ดูประวัติย้อนหลัง Export PDF และสรุปผลรายปี

## Run Local

```bash
npm start
```

จากนั้นเปิด:

```text
http://localhost:4180
```

## Default Login

```text
username: admin
password: admin123
```

ควรเปลี่ยนรหัสผ่านก่อนใช้งานจริง

## Data

ระบบใช้ไฟล์ JSON เป็นฐานข้อมูลสำหรับ MVP:

```text
data/db.json
```

ใน GitHub จะไม่เก็บ `data/db.json` ตัวจริง เพราะมีข้อมูลผู้ใช้/ประวัติการตรวจ ระบบจะสร้างไฟล์นี้จาก `data/db.example.json` เมื่อเปิดครั้งแรก

## Next Step: Cloudflare

ระบบ Cloudflare Pages Functions รองรับ D1 binding ชื่อ `DB` แล้ว

ตั้งค่าบน Cloudflare:

1. ไปที่ Storage & databases > D1 SQL Database
2. Create database ชื่อ `phithan5s-db`
3. ไปที่ Workers & Pages > phithan5s > Settings > Bindings
4. Add binding > D1 database
5. Variable name ใส่ `DB`
6. เลือก database `phithan5s-db`
7. Save แล้ว Redeploy

เมื่อมี binding `DB` แล้ว ระบบจะสร้างตาราง `app_state` อัตโนมัติและ seed ข้อมูลตั้งต้นจาก `functions/_seed.js` ในครั้งแรก จากนั้นการเพิ่ม User, สาขา, แผนก, Template และประวัติการตรวจจะถูกเก็บลง D1

ขั้นต่อไปหลัง D1 คือย้ายไฟล์ลายเซ็นจาก memory/base64 ไป Cloudflare R2
