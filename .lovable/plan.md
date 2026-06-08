## Məqsəd

Mövcud tək-quiz sistemini çoxlu **assessment** (test paketi) dəstəkləyən platformaya çeviririk. Admin bir neçə assessment yaradır, hər birinə ad verir. İstifadəçi **assessment adı + sıra nömrəsi** daxil edərək uyğun quizə girir.

Əlavə imkanlar:
1. Admin → istifadəçilərə **anlıq mesaj/xəbərdarlıq** (realtime, dərhal ekranda görünür).
2. İstifadəçi quiz içində **rəqəmlərə toxunaraq** suallar arası keçid (şəkildəki kimi naviqasiya şəbəkəsi).
3. Admin sualları **redaktə** edə, **silə**, **yeni əlavə** edə bilsin (həm sonuna, həm istənilən yerə).
4. **Cihaz kilidi**: hər sıra nömrəsi ilk girişdə cihaza (device id) bağlanır; başqa brauzerdən eyni nömrə ilə girmək olmaz.
5. Admin → istifadəçini **bloklama / blokdan çıxarma** (ayrı bölmə).
6. Admin → istifadəçinin girişini **resetləmə** və sıra nömrəsini dəyişmə (səhv nömrə daxil edən üçün).

## Verilənlər bazası (yeni miqrasiya)

```text
assessments
  id, name (unique), description, question_count (default), order_mode, is_open, created_at, updated_at

questions            (mövcud + dəyişiklik)
  + assessment_id  -> assessments.id  (NOT NULL)

participants         (yeni — sıra nömrəsi + cihaz kilidi)
  id, assessment_id, seat_number, device_id, blocked (bool), created_at
  UNIQUE(assessment_id, seat_number)

admin_messages       (yeni — realtime ismarıclar)
  id, assessment_id (nullable=hamıya), seat_number (nullable=hamıya), body, kind (info/warning), created_at

quiz_results         (mövcud + dəyişiklik)
  + assessment_id
```

- Bütün cədvəllərə uyğun GRANT + RLS.
- `participants` və `admin_messages` üçün admin əməliyyatları server funksiyaları (service role) ilə aparılacaq; oxuma istifadəçi üçün məhdud.
- `admin_messages` üçün Realtime aktivləşdiriləcək (publication).

## Cihaz kilidi məntiqi

- Brauzerdə `localStorage`-da unikal `deviceId` saxlanılır (yoxdursa yaradılır).
- İstifadəçi assessment + sıra daxil etdikdə server funksiyası:
  - Sıra boşdursa → bu device id ilə qeyd edir, icazə verir.
  - Sıra varsa və device id eynidirsə → icazə.
  - Sıra varsa və device id fərqlidirsə → rədd ("Bu sıra başqa cihaza bağlıdır").
  - `blocked = true` → rədd ("Girişiniz bloklanıb").
- Admin reset → həmin participant-ın `device_id` silinir (yeni cihazdan girə bilər) və ya sıra nömrəsi dəyişilir.

## Realtime mesajlaşma

- İstifadəçi quiz səhifəsində öz `assessment_id`+`seat_number`-na uyğun `admin_messages`-ə Supabase Realtime ilə abunə olur.
- Yeni mesaj gəldikdə ekranda toast + üst banner kimi dərhal göstərilir.
- Admin paneldə "Mesaj göndər" bölməsi: hədəf (bütün assessment / konkret sıra), mətn, tip (info/xəbərdarlıq).

## Admin panel (yenilənmiş /admin)

Tablar:
- **Assessmentlər**: yarat / sil / aç-bağla, ad + sual sayı + ardıcıllıq. PDF yükləmə artıq seçilmiş assessmentə bağlanır.
- **Suallar**: seçilmiş assessmentin sualları — redaktə (mətn, variantlar, düzgün cavab), sil, yeni əlavə (sona və ya aralığa).
- **İştirakçılar**: sıra nömrələri siyahısı, blokla/blokdan çıxar, giriş resetlə, sıra dəyiş.
- **Mesajlar**: realtime ismarıc göndər.
- **Nəticələr**: assessment üzrə nəticələr.

## İstifadəçi axını (yenilənmiş)

- Ana səhifə: **Assessment adı** + **Sıra nömrəsi** soruşulur → server yoxlayır (mövcudluq, cihaz, blok) → quiz açılır.
- Quiz səhifəsi: sual kartı + altda **rəqəmli naviqasiya şəbəkəsi** (cavablanmış/cari/boş fərqlənir), Əvvəlki/Növbəti, realtime mesaj banneri.

## Texniki qeydlər

- Bütün admin yazma əməliyyatları `src/lib/quiz.functions.ts` daxilində `ADMIN_PASSWORD` yoxlaması ilə server funksiyaları kimi (service role) qalır.
- Yeni server funksiyaları: assessment CRUD, participant join/reset/block, question CRUD, message send.
- Quiz oxuması üçün `quiz-client.ts` assessmentə görə filtrlənəcək; Realtime browser client ilə.
- `pdf-to-images` + `extractQuiz` dəyişmir, sadəcə `assessment_id` parametri əlavə olunur.

## Təsdiq sonrası ardıcıllıq

1. Miqrasiya (cədvəllər + RLS + realtime).
2. Server funksiyaları (assessment, participant, question CRUD, mesaj).
3. Admin panel UI (tablar).
4. İstifadəçi ana səhifə + quiz (naviqasiya şəbəkəsi + realtime banner).
5. Yoxlama (build, əsas axınlar).
