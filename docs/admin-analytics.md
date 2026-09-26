# MCDA Admin & Analytics

หน้า `/admin` เป็นรายงานอ่านอย่างเดียวตามตัวอย่าง HTML ที่ได้รับ แต่เชื่อม PostgreSQL จริง ไม่ใช้ข้อมูลจำลองใน production และไม่ยืนยันชำระเงินหรือแก้สิทธิ์สมาชิกผ่านหน้านี้

## เปิดใช้งาน

ตั้ง `DATABASE_URL` และ `AUTH_SECRET` ตามระบบเดิม กำหนด `MCDA_ADMIN_EMAILS` เป็นอีเมลผู้ดูแลจริงคั่นด้วย comma บัญชีต้องมีอยู่ใน `users` และยืนยันอีเมลแล้ว ตั้ง `NEXT_PUBLIC_APP_URL` ให้ตรงกับ origin HTTPS จริง เพราะ API เก็บ Page views ตรวจ Origin จากนั้น build/deploy ตามขั้นตอนปกติและเปิด `/admin` หรือปุ่ม Admin บนหน้าวิเคราะห์

การเปิด PR ไม่ได้ deploy หรือแก้ฐานข้อมูล production เมื่อเวอร์ชันใหม่เริ่มใช้งานจะสร้างตารางและ index เพิ่มแบบ idempotent ตามรูปแบบเดิมของ repository บัญชี DB ต้องมีสิทธิ์สร้างตาราง/index ครั้งแรก ควรสำรองฐานข้อมูลและทดลอง staging ก่อน deploy รายงานใช้ read-only repeatable-read transaction และ timeout 15 วินาที

## ใช้งาน

ค่าเริ่มต้นย้อนหลัง 7 วันรวมวันนี้ มีปุ่ม 15/30/90 วัน และเลือกเองได้สูงสุด 366 วันต่อครั้ง ใช้ Asia/Bangkok: รวม 00:00 วันเริ่มต้น จนถึงแต่ไม่รวม 00:00 วันถัดจากวันสิ้นสุด

ตัวกรองอยู่ใน URL จึงกดย้อนกลับหรือเปิดรายการเดิมได้ มี pagination 10/25/50/100 รายการ ส่งออก CSV ครบทุกหน้าตามตัวกรองสูงสุด 10,000 แถว ถ้าเกินจะแจ้งให้ลดช่วงวันที่ ไม่ตัดข้อมูลเงียบ ๆ CSV มี UTF-8 BOM และป้องกัน formula injection

หมวดรายงาน: ภาพรวม ผู้ลงทะเบียน การใช้งานเว็บ การวิเคราะห์ การชำระเงิน สิทธิ์สมาชิก และคำขอรอ OTP คลิก KPI จุดกราฟ มิติย่อย ชื่อผู้ใช้ หรือรายละเอียดเพื่อเจาะข้อมูล ทุก drilldown คงช่วงวันที่ ยกเว้นจุดกราฟรายวันซึ่งเจาะวันนั้น กราฟสลับตัวชี้วัดได้และมีตารางข้อมูลที่ใช้ keyboard ได้

## นิยามตัวเลข

| ตัวเลข | ความหมาย |
| --- | --- |
| ผู้ใช้ทั้งหมด | บัญชีปัจจุบันทุกวัน ไม่ใช่จำนวนสมัครใหม่ในช่วงที่เลือก |
| สมัครใหม่ | วันสมัครจริง `users.created_at` อยู่ในช่วงเวลา |
| สมัครผ่าน Premium Page | ผู้เปิด `/billing` ขณะยังไม่ login แล้วสมัครบัญชีใหม่ในเบราว์เซอร์เดียวกันภายใน 30 นาที นับหลัง OTP/Google สร้างบัญชีสำเร็จ ไม่ใช่จำนวนคนจ่ายเงิน |
| แหล่งสมัครไม่ทราบ | บัญชีเดิมไม่มี attribution ไม่อนุมานจากรายการซื้อ |
| Page views | เหตุการณ์เปิด pathname ที่อนุญาต มีทั้ง anonymous/signed-in ไม่ใช่ sessions หรือ unique visitors |
| เฉลี่ย/วัน | Page views หารวันปฏิทินทั้งหมดที่เลือก รวมวันไม่มีเหตุการณ์และวันนี้ที่ยังไม่สิ้นสุด |
| Active users | DISTINCT user_id ที่เปิดหน้าเว็บขณะ login หรือได้รับอนุมัติการวิเคราะห์ รวม `analysis_usage` เดิมด้วย ไม่รวม anonymous/login อย่างเดียว และไม่ใช่ผลรวมคนรายวัน |
| การวิเคราะห์ | Generate ที่ได้รับอนุมัติจากโควตา ไม่ใช่การยืนยันว่าคำนวณสำเร็จ |
| โมเดล | เหตุการณ์ authorization ใหม่ แจกแจงตามโมเดลที่เลือก คำขอเดียวมีหลายโมเดลได้ ไม่มีการแจกแจงข้อมูลเก่าย้อนหลังจากยอดรวม |
| Provider / แพ็กเกจ | วิธี login ที่ผูกไว้และแพ็กเกจ ณ ปัจจุบัน ไม่ใช่ snapshot ของทุกวันในอดีต |
| ชำระสำเร็จ / THB | สถานะ paid ตาม `paid_at` รายรับรวมเฉพาะ THB ไม่ใช่ยอดสุทธิหลังคืนเงินหรือค่าธรรมเนียม |
| รายการชำระเงิน | ปกติใช้ `created_at`; เมื่อเลือก paid ใช้ `paid_at` ให้ตรง KPI กราฟสถานะใช้กติกานี้เช่นกัน |
| สิทธิ์สมาชิก | กรอง `starts_at`; currently_active คำนวณ ณ ปัจจุบัน |
| รอ OTP | เฉพาะคำขอที่ยังอยู่ในตาราง ไม่รวมคำขอเก่าที่ถูกลบ ไม่แสดง OTP/hash |

เริ่มเก็บ Page views, Login, แหล่งสมัครและโมเดลตั้งแต่ติดตั้งเวอร์ชันนี้ วันที่เริ่มเก็บแสดงในหน้า ไม่มีข้อมูลย้อนหลังที่แต่งขึ้น เบอร์โทรศัพท์ไม่มีใน schema ปัจจุบัน กราฟมิติย่อยแสดง Top 20; ตารางรายละเอียดแบ่งหน้าได้ครบ

## การเข้าถึงและข้อมูล

เพิ่มตาราง `analytics_events`, `registration_attributions`, `analytics_metadata`, `analytics_rate_limits` และ index โดยไม่เปลี่ยนข้อมูลบัญชีหรือรายการจ่ายเดิม หน้า admin และ API ตรวจ session, allowlist, บัญชีที่ยังมีอยู่และ email_verified_at รวมถึง CSV บัญชีทั่วไปหรือบัญชีถูกลบเข้าถึงไม่ได้ ผลตอบกลับ private/no-store

เก็บ pathname ที่ allowlist, เวลา server, user_id จาก session, กลุ่มอุปกรณ์จาก User-Agent, hostname ต้นทางและชื่อโมเดล ไม่เก็บ query string, raw User-Agent, raw IP, รหัสผ่าน, OTP, OAuth code หรือ gateway response ไม่ติดตั้ง tracker ภายนอก ไม่ติดตาม `/admin` หรือ callback/API URL

Browser tracking เคารพ Do Not Track/Global Privacy Control ส่วน server login/authorization ยังบันทึกเป็น operational records นี่ไม่ใช่ระบบ consent management หรือคำรับรองการปฏิบัติตามกฎหมาย ผู้ดูแลต้องทบทวนนโยบาย privacy และ retention ของตน

API เก็บเหตุการณ์ตรวจ Origin, จำกัด JSON 4 KiB, UUID deduplication และ shared PostgreSQL rate limit 120 events/นาที/บัญชีหรือ address bucket ใช้ HMAC แทนเก็บ IP ตั้ง reverse proxy ให้เขียนทับ X-Forwarded-For ที่เชื่อถือได้ และเสริม edge rate limiting สำหรับ public ingress ข้อมูลจาก browser/cookie เป็น observational analytics ที่ผู้ใช้ปลอมได้ ห้ามใช้เป็นหลักฐานชำระเงินหรืออนุญาตสิทธิ์

ยังไม่มี automatic retention/deletion ของ event history เพื่อไม่ลบข้อมูลโดยไม่ทราบนโยบาย ผู้ดูแลต้องกำหนด retention ก่อนเก็บระยะยาว หากลบประวัติเก่า รายงานช่วงนั้นอาจไม่ครบ วันที่เริ่มเก็บไม่ใช่คำรับรองว่าทุกเหตุการณ์ยังอยู่ การลบบัญชีลบ attribution และเปลี่ยน user_id ของเหตุการณ์เป็น NULL

## ตรวจสอบ

```bash
node --experimental-strip-types --test tests/admin-analytics.test.mjs
npm run build
```

ชุดทดสอบ contract ครอบคลุม 37 กรณี: ขอบเขตวันไทย ปีอธิกสุรทิน วันไม่ถูกต้อง การกรอง pagination CSV และ referrer ส่วนการเชื่อม PostgreSQL, OAuth/OTP จริง, reverse proxy, browser และปริมาณ production ต้องตรวจเพิ่มเติมใน staging ผลทดสอบที่รันจริงให้ดูจาก PR ไม่ควรถือว่ามีไฟล์ทดสอบแล้วหมายถึงทดสอบผ่าน
