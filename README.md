# Stream Boshqaruv Markazi — Windows uchun (15 kanal)

Bu — **15 ta YouTube kanalni bir joydan, mustaqil ravishda** boshqaradigan shaxsiy dashboard. Har bir kanalning o'z videolari, o'z stream key'i, o'z 50 GB xotira limiti va o'z efir (live) holati bor — kanallar bir-biriga umuman aralashmaydi. Faqat sizning kompyuteringizda ishlaydi, brauzerda ochiladi (http://localhost:3000).

## 1-qadam: Node.js o'rnatish (bir marta)

1. https://nodejs.org ga kiring
2. **LTS** versiyani yuklab, o'rnating (hammasini "Next, Next, Finish" bosib o'tsangiz bo'ladi)
3. O'rnatilgach, kompyuterni qayta yoqish shart emas

## 2-qadam: FFmpeg o'rnatish (bir marta)

1. https://www.gyan.dev/ffmpeg/builds/ ga kiring
2. **"release full"** versiyasini (masalan `ffmpeg-release-full.7z`) yuklab oling
3. Arxivni yeching (masalan `C:\ffmpeg` papkasiga)
4. `C:\ffmpeg\bin` papkasini Windows PATH'ga qo'shing:
   - Boshlash tugmasi → "Environment Variables" deb yozing → "Edit the system environment variables" → **Environment Variables** tugmasi
   - "System variables" bo'limida **Path** ni tanlang → **Edit** → **New** → `C:\ffmpeg\bin` deb yozing → OK bosaveringiz
5. Tekshirish: Command Prompt (cmd) oching, `ffmpeg -version` deb yozing — versiya chiqsa, tayyor.

## 3-qadam: Dashboardni ishga tushirish

1. Ushbu `youtube-dashboard` papkasini kompyuteringizga ko'chiring (masalan Desktop'ga)
2. `start.bat` faylini ikki marta bosing
3. Brauzeringizda avtomatik `http://localhost:3000` ochiladi — mana shu sizning boshqaruv markazingiz

**Diqqat:** `start.bat` ochilgan qora oynani yopmang — u serverni ishlatib turadi. Yopsangiz, dashboard va barcha joriy streamlar ham to'xtaydi.

## 4-qadam: Foydalanish

Chapdagi ro'yxatda 15 ta kanal (Kanal 1 — Kanal 15) ko'rinadi. Kerakli kanalni bosib tanlang, so'ng o'sha kanal uchun quyidagilarni bajaring:

1. **Kanal nomini o'zgartirish** — sarlavha yonidagi ✎ tugmasini bosing (masalan "Kanal 1" o'rniga "Sport kanali" deb qo'yish uchun)
2. **Stream key qo'shish** — YouTube Studio → Yaratish → Efirni boshlash → Stream key'ni nusxalab, "YouTube stream key" bo'limiga joylashtiring va Saqlash bosing
3. **Video yuklash** — "Faylni tanlang" → video tanlang → "Yuklash". Har bir kanal uchun limit: **50 GB**
4. **Efirga chiqarish** — kerakli videoning yonidagi "Efirga uzatish" tugmasini bosing. Video avtomatik cheksiz aylanib (loop) o'sha kanalning YouTube efiriga uzatiladi
5. **To'xtatish** — efirdagi videoning yonidagi "To'xtatish" tugmasi bilan istalgan vaqtda to'xtatishingiz mumkin

Chap paneldagi qizil nuqta — o'sha kanal hozir efirda ekanini bildiradi. Bir nechta kanal **bir vaqtning o'zida, mustaqil ravishda** efirga chiqishi mumkin (masalan Kanal 1 va Kanal 7 parallel ishlashi mumkin).

## Muhim eslatmalar

- Har bir kanalda bir vaqtda faqat bitta video efirga chiqishi mumkin (lekin 15 ta kanal parallel ishlay oladi).
- Har bir kanal uchun alohida 50 GB xotira limiti bor. Barcha 15 ta kanal to'liq to'lsa, kompyuteringizda jami **~750 GB** bo'sh joy kerak bo'ladi — diskingizdagi joy yetarli ekanini oldindan tekshiring.
- Internet uzilib qolsa, har bir kanal 10 soniyadan keyin avtomatik qayta ulanishga harakat qiladi.
- Kompyuter uyquga (sleep) ketmasligi kerak, aks holda streamlar to'xtaydi: Settings → System → Power & battery → "When plugged in, put my device to sleep after" → **Never**.
- Noutbuk bo'lsa, albatta zaryadga ulab qo'ying.
- Har bir kanal uchun faqat 1 ta stream key saqlanadi. Yangisini qo'yish uchun avval eskisini o'chiring.
