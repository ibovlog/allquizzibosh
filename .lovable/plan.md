# Multi-Tenant Sistem (Super Admin + Kurs Admini)

Mövcud sistem parolla işləyir (`ADMIN_PASSWORD`) və heç bir kurs/tenant ayrımı yoxdur. Bütün assessment, sual, istifadəçi və nəticə bir yerdədir. Məqsəd: hər şeyi **kurs (tenant)** əsasında ayırmaq və iki rol əlavə etmək — **Super Admin** (sistem sahibi) və **Kurs Admini**.

## 1. Verilənlər bazası dəyişiklikləri

**Yeni cədvəllər:**
- `courses` — kurslar (tenant): `name`, `slug`, `is_active`, brendləşdirmə (`logo_url`, `primary_color`, `login_title`, `login_subtitle`).
- `course_admins` — kurs adminləri: `course_id`, `username` (unikal), `password_hash`, `is_active`.

**Mövcud cədvəllərə `course_id` sütunu əlavə olunacaq:**
`assessments`, `questions`, `participants`, `access_keys`, `quiz_results`, `problem_reports`, `processing_errors`, `admin_messages`.

**Miqrasiya (data köçürməsi):** Bir "Default" kurs yaradılacaq və bütün mövcud məlumatlar (assessment-lər və s.) həmin kursa bağlanacaq — heç bir data itməyəcək, mövcud sistem pozulmayacaq.

**Təhlükəsizlik:** Bu cədvəllər yalnız server tərəfindən (`supabaseAdmin`) idarə olunur. `course_admins.password_hash` heç vaxt cliyentə göndərilməyəcək. Ayırma tamamilə server funksiyalarında `course_id` filtri ilə təmin olunur.

## 2. Autentifikasiya və sessiya

Hazırda hər server funksiyası çılpaq parol qəbul edir. Bunun əvəzinə:
- **Login** (`adminLogin`) username + password qəbul edəcək:
  - Əgər username boşdursa / parol `ADMIN_PASSWORD`-a uyğundursa → **Super Admin**.
  - Əks halda `course_admins`-də yoxlanılacaq → **Kurs Admini** (öz `course_id`-si ilə).
- Login imzalanmış (HMAC) **token** qaytaracaq: `{ role, courseId, exp }`. Token client-də saxlanılacaq və hər server funksiyasına parol əvəzinə ötürüləcək.
- Server tərəfdə köməkçi `resolveSession(token)` tokeni yoxlayıb `{ role, courseId }` verəcək. Bütün mövcud funksiyalarda parol yoxlaması bununla əvəz olunacaq və sorğulara `course_id` filtri əlavə olunacaq.
- HMAC açarı üçün yeni bir secret (`SESSION_SECRET`) yaradılacaq.

## 3. Kurs Admini paneli (mövcud `/admin`)

Mövcud admin panelinin BÜTÜN funksiyaları saxlanılır və indi kurs kontekstində işləyir:
- Kurs Admini yalnız öz kursunun assessment, sual, PDF/DOCX, istifadəçi, nəticə, hesabat və emal xətalarını görür.
- PDF/DOCX yükləndikdə AI-nin yaratdığı suallar avtomatik həmin kursun `course_id`-si ilə saxlanılır.
- Emal xətaları ("Emal Xətaları" tabı) kursa bağlı qalır.
- Brendləşdirmə tabı əlavə olunur: loqo, rəng, giriş başlığı.

## 4. Super Admin paneli (yeni tab-lar)

Super Admin öz mövcud admin imkanlarının hamısına sahib olur, ƏLAVƏ olaraq:
- **İdarə paneli**: ümumi kurs sayı, admin sayı, assessment sayı, istifadəçi sayı, aktiv istifadəçi sayı.
- **Kurslar**: kurs yaratma, aktiv/deaktiv, silmə.
- **Kurs Adminləri**: admin yaratma, login/şifrə dəyişmə, aktiv/deaktiv.
- **Kursa keç**: istənilən kursu seçib həmin kursun tam admin panelinə daxil olma (context switch).

## 5. Giriş ekranı brendləşdirməsi

İştirakçı giriş ekranı (`/`) kursa görə brendləşə bilər (loqo, rəng, başlıq). Kurs slug və ya seçim əsasında müəyyən olunacaq; detal implementasiya zamanı sadə saxlanacaq (default kurs brendi göstəriləcək, kurs seçildikdə onunki).

## Texniki qeydlər
- Bütün 25+ server funksiyası `token` qəbul edəcək şəkildə yenilənəcək; hər sorğuya `course_id` bərabərliyi əlavə olunacaq. Super Admin `courseId` override edə bilər (kursa keçid).
- Parol hash üçün Web Crypto (SHA-256 + salt) istifadə olunacaq (Worker runtime uyğun).
- Mövcud `admin.tsx` böyük fayldır (964 sətir); rol/kurs kontekstinə görə şərti render əlavə olunacaq, mövcud UI qorunacaq.
- Bu böyük dəyişiklikdir və bir neçə addımda tətbiq olunacaq: əvvəlcə DB miqrasiyası, sonra server funksiyaları, sonra UI.

Təsdiq etsən, əvvəlcə verilənlər bazası miqrasiyasından başlayacağam.