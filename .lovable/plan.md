## Məqsəd

Mövcud quiz platformasını aşağıdakı 10 tələblə tam yeniləyirik. Dəyişikliklər verilənlər bazası, server funksiyaları və həm admin, həm istifadəçi interfeysinə toxunur.

## 1. Verilənlər bazası (yeni miqrasiya)

```text
assessments (mövcud + əlavə)
  + login_mode text  ('seat' | 'key' | 'both')   default 'seat'
  + seat_min int, seat_max int                    (sıra aralığı)
  + resume_after_unblock bool  default true

questions (mövcud + əlavə)
  + pdf_number int        (PDF/Word-dəki orijinal sual nömrəsi)
  + source_file text      (yükləndiyi fayl adı)

access_keys (yeni)
  id, assessment_id, key_code (unique per assessment), used_by_device, blocked, created_at

participants (mövcud + əlavə)
  + access_key text        (açarla giriş üçün)
  + current_index int      (qaldığı sual — davam üçün)
  + answers jsonb          (verilmiş cavablar — davam üçün)

processing_errors (yeni)
  id, assessment_id, file_name, question_number, reason, status ('pending'|'resolved'),
  raw_excerpt text, question_id (nullable), created_at

quiz_results (mövcud + əlavə)
  + details jsonb   (səhv/doğru cavab hesabatı: prompt, pdf_number, chosen, correct)
```

Hər yeni public cədvələ GRANT + RLS. `access_keys`, `processing_errors` yalnız server (service role) tərəfindən idarə olunur; oxuma admin server funksiyaları ilə. Realtime: `participants` (bloklama anında tətbiq üçün) və mövcud `admin_messages`.

## 2. PDF / Word emalı (maksimum dəqiqlik)

- Admin PDF **və ya Word** (.docx) yükləyə bilsin.
- Çoxmərhələli emal: PDF → səhifə şəkilləri (skan üçün OCR), həmçinin mətn təbəqəsi varsa onu da AI-yə ötürürük (mətn + şəkil birgə → daha dəqiq).
- AI-dən hər sual üçün: `prompt`, `options`, `correct_index`, **`pdf_number`** (mənbədəki orijinal nömrə) tələb olunur.
- Sual sayı limiti olmadan (10/50/200+) bütün səhifələr partiyalarla (batch) emal olunur, nəticələr birləşdirilir.
- Yoxlama: variant sayı < 2, düzgün cavab tapılmayıb, prompt boş/natamam, pdf_number yoxdur → sual yenə yaradılır, lakin `processing_errors`-a qeyd düşür (fayl adı, sual nömrəsi, səbəb).

## 3. Emal Xətaları bölməsi (admin)

- Yeni tab "Emal Xətaları": assessment adı, fayl adı, PDF sual nömrəsi, səbəb, tarix, status.
- Hər sətirdən: əlaqəli sualı açıb redaktə et, düzgün cavabı təyin et, xətanı "Həll edildi" et (və ya sil).

## 4. İstifadəçi: sıralama + sual sayı seçimi

- Quizə başlamazdan əvvəl istifadəçi seçir: **Ardıcıl / Qarışıq** və **sual sayı** (assessment-dəki maksimuma qədər).
- Admin order_mode artıq yalnız standart dəyər; son söz istifadəçinindir.

## 5. Naviqasiyanın yenidən qurulması

- "Geri / Növbəti" düymələri birbaşa sual kartının altında.
- Rəqəmli naviqasiya (1,2,3…) onların altında, mobil üçün uyğun (scroll/grid).

## 6. Giriş modelləri (admin assessment başına seçir)

- **Variant A** — sıra nömrəsi aralığı (seat_min–seat_max).
- **Variant B** — giriş açarları (admin istənilən qədər açar yaradır, yalnız təsdiqlənmiş açarla giriş).
- **Variant C** — hər ikisi (sıra + açar tələb olunur).
- İstifadəçi ana səhifəsi login_mode-a görə müvafiq sahələri göstərir.

## 7. Real-time bloklama

- Admin bloklayan kimi `participants.blocked` → Realtime ilə istifadəçinin quiz səhifəsi dərhal sessiyanı bağlayır (səhifə yeniləməyə ehtiyac yox).
- Blokdan çıxaranda admin seçir: **qaldığı yerdən davam etsin** (current_index/answers saxlanılır) yoxsa **sıfırdan**.

## 8. Səhv cavabların göstərilməsi

- Test bitəndə hesabat: hər sual üçün mətn, PDF nömrəsi, istifadəçinin cavabı, doğru cavab, doğru/səhv işarəsi.
- Bu hesabat `quiz_results.details`-ə də yazılır.

## 9. Cihaz bağlama (Device Lock)

- İlk giriş cihaza bağlanır (mövcud device_id məntiqi genişlənir): seat həm də açar həmin cihaza kilidlənir; başqa nömrə/açar/brauzer/cihaz rədd edilir.
- Admin paneldə: cihaz kilidini sıfırla, istifadəçini yeni cihaza köçür (mövcud reset genişlənir + açar üçün də).

## 10. PDF orijinal sual nömrəsi

- Quiz ekranında: `15 / 200` və altında `PDF #87`.
- Random rejimdə də pdf_number sabit qalır; nəticələrdə görünür.
- "Problemi bildir" funksiyasında pdf_number avtomatik əlavə olunur (admin mesajı kimi göndərilir).
- Admin sual axtarışında pdf_number ilə tapmaq mümkün olsun.

## Texniki qeydlər

- Yeni server funksiyaları (`quiz.functions.ts`): Word emalı, batch extract + pdf_number, access key CRUD, processing_errors CRUD, genişlənmiş join (key/seat/both + device lock), unblock-with-resume, save progress, submit with details.
- `quiz.tsx`: order/count seçim ekranı, yeni naviqasiya, realtime blok dinləyicisi, pdf nömrəsi, bitiş hesabatı.
- `index.tsx`: login_mode-a görə dinamik giriş forması.
- Word üçün `.docx` mətn çıxarışı server tərəfdə (mammoth/JSZip kimi worker-uyğun kitabxana), şəkil PDF-lər üçün mövcud `pdf-to-images`.

## Ardıcıllıq

1. Miqrasiya (cədvəllər, sütunlar, GRANT/RLS, realtime).
2. Server funksiyaları.
3. Admin UI (giriş modelləri, açarlar, emal xətaları, axtarış, unblock-resume).
4. İstifadəçi UI (order/count, naviqasiya, realtime blok, pdf nömrəsi, hesabat).
5. Yoxlama (build + əsas axınlar).
