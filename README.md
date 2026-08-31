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

ขั้นต่อไปสำหรับขึ้น Cloudflare ควรแยกฐานข้อมูลจากไฟล์ JSON ไปใช้ Cloudflare D1 และเก็บไฟล์ลายเซ็นใน Cloudflare R2 เพื่อให้ระบบ online ได้จริงและข้อมูลไม่หายเมื่อ deploy ใหม่
