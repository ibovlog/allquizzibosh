# Quiz App — by @_.ibosh

PDF/Word fayllarından süni intellekt ilə avtomatik test yaradan, çoxistifadəçi (multi-tenant) onlayn imtahan platforması.

- **Canlı sayt:** https://quizapp-byibosh.lovable.app

---

## Əsas imkanlar

### 🤖 AI ilə sual yaradılması
- PDF və DOCX faylları yüklənir; süni intellekt (Lovable AI — Gemini) fayldan sualları və cavabları çıxarıb testə çevirir.
- Skan/şəkil formatında olan PDF-lər də dəstəklənir (səhifələr şəklə çevrilib AI-a göndərilir).
- Yüksək dəqiqlik üçün PDF səhifələri partiyalarla (5 səhifə) emal olunur.
- Sual mənbəyi fayldakı orijinal nömrə (`pdf_number`) ilə saxlanılır — tələbə imtahanda PDF nömrəsini görür.
- Emal zamanı baş verən xətalar ayrıca "Emal Xətaları" bölməsində izlənir və admin tərəfindən düzəldilə bilir.
- Admin sualları redaktə edə, silə, PDF suallarının ardına və ya ayrıca öz suallarını əlavə edə bilər.

### 🎓 Tələbə tərəfi
- **Giriş:** Assessment adı yazılır, sonra giriş növünə görə sıra nömrəsi və/və ya giriş açarı tələb olunur.
- **Giriş modları** (admin təyin edir): sıra aralığı (seat range), giriş açarları (access keys) və ya hər ikisi.
- Sual sayı və sırası (ardıcıl / qarışıq) tələbə tərəfindən seçilir; PDF sual aralığı da seçilə bilər.
- Rəqəmlərə toxunmaqla suallar arasında keçid — sual naviqasiya cədvəli (answered/current/empty statuslarla).
- Progress göstəricisi, "Növbəti / Əvvəlki" düymələri, cavabların avtomatik yadda saxlanması (resume dəstəyi).
- Nəticə ekranı: bal, hər sualın düzgün/səhv cavabı, sualın mətni və PDF nömrəsi.
- "Problem hesabat et" sistemi — tələbə suala şübhə edibs adminə bildirə bilir.
- Admin mesajları Realtime ilə imtahan ekranında anında göstərilir.

### 🔒 Təhlükəsizlik və Anti-cheat
- **Cihaz kilidi (device lock):** bir sıra nömrəsi yalnız bir cihazdan işləyir; başqa brauzerdə giriş bloklanır.
- **İmzalanmış tələbə tokeni:** tələbə yalnız öz sətrlərini dəyişə bilir (progress/finish/report sorğularında yoxlanılır).
- **Tab/pəncərə nəzarəti:** tələbə tab dəyişəndə xəbərdarlıq verilir; admin təyin etdiyi limit aşılında imtahan bağlanır, admin panelində "N dəfə tab dəyişdi" statusu görünür.
- **Məcburi tam ekran:** imtahan tam ekranda başlayır; kopyalama (Ctrl+C), sağ klik və ekran görüntüsü cəhdləri bloklanır.
- Bu parametrləri (tab limiti daxil) admin təyin edib aktiv/deaktiv edir.
- **Realtime bloklama:** admin tələbəni blokladığı anda sessiya bitir; blokdan çıxarılanda davam etmə mümkündür.
- Admin tələbənin girişini resetləyə və sıra nömrəsini dəyişə bilər.

### 🏫 Multi-Tenant sistem
- **Super Admin** (master şifrə ilə) bütün sistemi idarə edir.
- **Kurs Admini** yalnız öz kursunun məlumatlarını görür (data izolyasiyası `course_id` ilə).
- Kurs yaratma, aktiv/deaktiv etmə, silmə; kursa admin təyin etmə/dəyişmə.
- Kurs adminlərinin yaradılması, login/şifrə dəyişmə, aktiv/deaktiv idarəsi.
- Kursa "daxil olmaq" (context switch) — Super Admin istənilən kursun tam admin panelinə keçir.
- İdarə paneli statistikaları: kurs, admin, assessment, istifadəçi və aktiv istifadəçi sayları.
- Kursa görə brendləşdirmə: loqo, əsas rəng, giriş başlığı və alt başlığı.

### ⚙️ Admin paneli (kurs)
- Assessment yaratma/redaktə/silmə, açıq-bağlı statusu.
- PDF/DOCX yükləmə və AI emalı, sualların redaktəsi.
- İştirakçıların siyahısı: bal, bloklama, reset, tab-switch statusu.
- Nəticələr və hesabatların görüntülənməsi, problem hesabatları.
- Canlı mesaj göndərmə (realtime, hamıya və ya tək tələbəyə).
- Emal xətalarının izlənməsi.
- Giriş açarlarının yaradılması və idarəsi.
- Qaranlıq rejim (dark mode) admin tərəfindən aktiv/deaktiv edilir; tələbə ekranında keçid görünür.

### 🐍 Kod sualları (Python / Java) — planlaşdırılır
- Judge0 inteqrasiyası ilə Python və Java kodlarının avtomatik yoxlanılması nəzərdə tutulub.
- Tələbə üçün kod redaktoru, "Çalışdır" (nümunə testlər) və "Göndər" (bütün testlər) düymələri.
- Nəticələrdə keçən testlərin faizi və bal təsiri göstəriləcək.
- *Qeyd:* bu modul hələ qurulmayıb — Judge0 API açarı tələb olunur.

---

## Texnologiya

| Təbəqə | Texnologiya |
|---|---|
| Frontend | React 19, TanStack Start (SSR), TanStack Router, Tailwind CSS v4, shadcn/ui |
| Backend | Lovable Cloud (Supabase) — cədvəllər, RLS, Realtime |
| Server məntiqi | TanStack `createServerFn` server funksiyaları |
| AI | Lovable AI Gateway (Gemini) — PDF/DOCX-dən sual çıxarılması |
| Fayl emalı | `pdfjs-dist` (PDF→şəkil), `mammoth` (DOCX) |
| Auth | HMAC-SHA256 ilə imzalanmış sessiya tokenləri (Super/Kurs admini + tələbə) |

## Layihə strukturu

```
src/
├── routes/
│   ├── index.tsx        # Tələbə giriş səhifəsi (/)
│   ├── quiz.tsx         # İmtahan interfeysi (/quiz)
│   ├── admin.tsx        # Admin paneli (/admin) — Super + Kurs admini
│   └── __root.tsx       # Kök layout
├── lib/
│   ├── quiz.functions.ts  # Bütün server funksiyaları (assessment, sual, nəticə...)
│   ├── auth.server.ts     # Token imzalama/yoxlama (HMAC)
│   ├── tenant.server.ts   # Rol qoruyucuları (requireSuper/requireCourse)
│   ├── pdf-to-images.ts   # PDF səhifələrini şəklə çevirmə
│   └── quiz-client.ts     # Client köməkçiləri (device id və s.)
├── components/
│   └── ExamGuard.tsx      # Anti-cheat (tab nəzarəti, tam ekran, kopyalama bloku)
└── integrations/supabase/ # Supabase client-ləri (avto-generasiya)
```

## İşə salma

Layihə Lovable platformasında işləyir — backend (verilənlər bazası, Realtime, AI) Lovable Cloud ilə avtomatik quraşdırılıb.

```bash
npm install     # asılılıqları quraşdır
npm run dev     # lokal development server
npm run build   # production build
npm run lint    # ESLint yoxlaması
```

### Mühit dəyişənləri

| Dəyişən | Təyinat |
|---|---|
| `VITE_SUPABASE_URL` | Lovable Cloud URL (avto) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public açar (avto) |
| `ADMIN_PASSWORD` | Super Admin master şifrəsi (secret) |
| `SESSION_SECRET` | Sessiya tokenlərinin HMAC açarı (secret) |
| `LOVABLE_AI_API_KEY` | AI Gateway açarı (avto) |

## İstifadə axını

1. **Super Admin** `/admin`-ə daxil olur → kurs yaradır, kurs admini təyin edir.
2. **Kurs Admini** assessment yaradır, PDF/DOCX yükləyir → AI sualları çıxarır, admin redaktə edir.
3. Admin giriş növünü (sıra/açar), anti-cheat parametrlərini və dark mode-u təyin edir, assessment-i açır.
4. **Tələbə** `/` ünvanında assessment adı + giriş məlumatını yazır → imtahan başlayır.
5. İmtahan bitəndə tələbə nəticəsini görür; admin paneldə bütün nəticələr və hesabatlar toplanır.

---

*Quiz App — by @_.ibosh*
