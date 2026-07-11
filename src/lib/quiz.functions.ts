import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const tok = z.string().min(1).max(4000);
const pw = z.string().min(1).max(200);
const optionSchema = z.array(z.string().min(1).max(2000)).min(2).max(8);
const loginMode = z.enum(["seat", "key", "both"]);

// ===========================================================================
// AUTH / SESSION
// ===========================================================================
export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().trim().max(120).optional().default(""), password: pw }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signSession } = await import("@/lib/auth.server");
    const { verifyPassword } = await import("@/lib/auth.server");

    const superPw = process.env.ADMIN_PASSWORD || "admin123";
    // Super admin: correct master password (username ignored / "super"/"admin").
    const uname = data.username.trim();
    const looksSuper = uname === "" || uname.toLowerCase() === "super" || uname.toLowerCase() === "admin";
    if (looksSuper && data.password === superPw) {
      const token = await signSession({ role: "super", courseId: null });
      return { ok: true as const, role: "super" as const, token, courseId: null, courseName: null };
    }

    // Course admin lookup.
    const { data: admin } = await supabaseAdmin
      .from("course_admins")
      .select("id, course_id, password_hash, is_active, username")
      .ilike("username", uname)
      .maybeSingle();
    if (!admin || !admin.is_active) return { ok: false as const, reason: "İstifadəçi adı və ya şifrə yanlışdır." };
    const good = await verifyPassword(data.password, admin.password_hash);
    if (!good) return { ok: false as const, reason: "İstifadəçi adı və ya şifrə yanlışdır." };

    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("id, name, is_active")
      .eq("id", admin.course_id)
      .maybeSingle();
    if (!course || !course.is_active) return { ok: false as const, reason: "Bu kurs deaktiv edilib." };

    await supabaseAdmin
      .from("course_admins")
      .update({ last_login_at: new Date().toISOString() } as never)
      .eq("id", admin.id);

    const token = await signSession({ role: "course", courseId: admin.course_id, username: admin.username });
    return { ok: true as const, role: "course" as const, token, courseId: course.id, courseName: course.name };
  });

// Super admin enters / exits a course context (returns a new scoped token).
export const enterCourse = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: tok, course_id: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSuper } = await import("@/lib/tenant.server");
    const { signSession } = await import("@/lib/auth.server");
    const { session, supabaseAdmin } = await requireSuper(data.token);
    let courseName: string | null = null;
    if (data.course_id) {
      const { data: c } = await supabaseAdmin
        .from("courses")
        .select("name")
        .eq("id", data.course_id)
        .maybeSingle();
      courseName = c?.name ?? null;
    }
    const token = await signSession({ role: session.role, courseId: data.course_id, username: session.username });
    return { ok: true as const, token, courseId: data.course_id, courseName };
  });

// ===========================================================================
// SUPER ADMIN
// ===========================================================================
export const getSuperData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok }).parse(input))
  .handler(async ({ data }) => {
    const { requireSuper } = await import("@/lib/tenant.server");
    const { supabaseAdmin } = await requireSuper(data.token);

    const [courses, admins, assessmentCount, participantCount, activeParticipants] = await Promise.all([
      supabaseAdmin.from("courses").select("id, name, slug, is_active, logo_url, primary_color, login_title, login_subtitle, created_at").order("created_at", { ascending: true }),
      supabaseAdmin.from("course_admins").select("id, course_id, username, is_active, created_at, last_login_at").order("created_at", { ascending: true }),
      supabaseAdmin.from("assessments").select("id, course_id"),
      supabaseAdmin.from("participants").select("id, course_id, completed"),
      supabaseAdmin.from("access_keys").select("id, course_id, completed"),
    ]);
    if (courses.error) throw new Error(courses.error.message);

    const assessments = assessmentCount.data ?? [];
    const parts = participantCount.data ?? [];
    const keys = activeParticipants.data ?? [];
    const totalUsers = parts.length + keys.length;
    const activeUsers = parts.filter((p) => !p.completed).length + keys.filter((k) => !k.completed).length;

    // Per-course stats
    const statsByCourse: Record<string, { assessments: number; users: number }> = {};
    for (const a of assessments) {
      const cid = (a as { course_id: string | null }).course_id ?? "";
      statsByCourse[cid] = statsByCourse[cid] || { assessments: 0, users: 0 };
      statsByCourse[cid].assessments++;
    }
    for (const p of parts) {
      const cid = (p as { course_id: string | null }).course_id ?? "";
      statsByCourse[cid] = statsByCourse[cid] || { assessments: 0, users: 0 };
      statsByCourse[cid].users++;
    }
    for (const k of keys) {
      const cid = (k as { course_id: string | null }).course_id ?? "";
      statsByCourse[cid] = statsByCourse[cid] || { assessments: 0, users: 0 };
      statsByCourse[cid].users++;
    }

    return {
      courses: courses.data ?? [],
      admins: admins.data ?? [],
      statsByCourse,
      totals: {
        courses: (courses.data ?? []).length,
        admins: (admins.data ?? []).length,
        assessments: assessments.length,
        users: totalUsers,
        activeUsers,
      },
    };
  });

export const createCourse = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: tok,
      name: z.string().trim().min(1).max(120),
      slug: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, "slug yalnız kiçik hərf, rəqəm və tire ola bilər"),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSuper } = await import("@/lib/tenant.server");
    const { supabaseAdmin } = await requireSuper(data.token);
    const { data: row, error } = await supabaseAdmin
      .from("courses")
      .insert({ name: data.name, slug: data.slug } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Bu ad və ya slug artıq mövcuddur.");
      throw new Error(error.message);
    }
    return { id: row.id };
  });

export const updateCourse = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: tok,
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120).optional(),
      is_active: z.boolean().optional(),
      logo_url: z.string().trim().max(1000).nullable().optional(),
      primary_color: z.string().trim().max(40).nullable().optional(),
      login_title: z.string().trim().max(160).nullable().optional(),
      login_subtitle: z.string().trim().max(300).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSuper } = await import("@/lib/tenant.server");
    const { supabaseAdmin } = await requireSuper(data.token);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url || null;
    if (data.primary_color !== undefined) patch.primary_color = data.primary_color || null;
    if (data.login_title !== undefined) patch.login_title = data.login_title || null;
    if (data.login_subtitle !== undefined) patch.login_subtitle = data.login_subtitle || null;
    const { error } = await supabaseAdmin.from("courses").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCourse = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireSuper } = await import("@/lib/tenant.server");
    const { supabaseAdmin } = await requireSuper(data.token);
    // Remove all course-scoped data first (in case FKs are not ON DELETE CASCADE).
    const childTables = [
      "questions", "quiz_results", "problem_reports", "processing_errors",
      "admin_messages", "participants", "access_keys", "assessments",
      "course_admins",
    ] as const;
    for (const t of childTables) {
      await supabaseAdmin.from(t).delete().eq("course_id", data.id);
    }
    const { error } = await supabaseAdmin.from("courses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createCourseAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: tok,
      course_id: z.string().uuid(),
      username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9_.-]+$/, "İstifadəçi adı yalnız hərf, rəqəm, _ . - ola bilər"),
      password: z.string().min(4).max(200),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSuper } = await import("@/lib/tenant.server");
    const { hashPassword } = await import("@/lib/auth.server");
    const { supabaseAdmin } = await requireSuper(data.token);
    const password_hash = await hashPassword(data.password);
    const { error } = await supabaseAdmin
      .from("course_admins")
      .insert({ course_id: data.course_id, username: data.username, password_hash } as never);
    if (error) {
      if (error.code === "23505") throw new Error("Bu istifadəçi adı artıq mövcuddur.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateCourseAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: tok,
      id: z.string().uuid(),
      username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
      password: z.string().min(4).max(200).optional(),
      is_active: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSuper } = await import("@/lib/tenant.server");
    const { hashPassword } = await import("@/lib/auth.server");
    const { supabaseAdmin } = await requireSuper(data.token);
    const patch: Record<string, unknown> = {};
    if (data.username !== undefined) patch.username = data.username;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    if (data.password !== undefined) patch.password_hash = await hashPassword(data.password);
    const { error } = await supabaseAdmin.from("course_admins").update(patch as never).eq("id", data.id);
    if (error) {
      if (error.code === "23505") throw new Error("Bu istifadəçi adı artıq mövcuddur.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// Create a course and its first course admin in one step (Super Admin flow).
export const createCourseWithAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: tok,
      course_name: z.string().trim().min(1).max(120),
      username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9_.-]+$/, "İstifadəçi adı yalnız hərf, rəqəm, _ . - ola bilər"),
      password: z.string().min(4).max(200),
      is_active: z.boolean().optional().default(true),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSuper } = await import("@/lib/tenant.server");
    const { hashPassword } = await import("@/lib/auth.server");
    const { supabaseAdmin } = await requireSuper(data.token);

    const baseSlug =
      data.course_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50) || "kurs";
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

    const { data: course, error: cErr } = await supabaseAdmin
      .from("courses")
      .insert({ name: data.course_name, slug } as never)
      .select("id")
      .single();
    if (cErr) {
      if (cErr.code === "23505") throw new Error("Bu kurs adı artıq mövcuddur.");
      throw new Error(cErr.message);
    }

    const password_hash = await hashPassword(data.password);
    const { error: aErr } = await supabaseAdmin
      .from("course_admins")
      .insert({ course_id: course.id, username: data.username, password_hash, is_active: data.is_active } as never);
    if (aErr) {
      // Roll back the orphaned course so the super admin can retry cleanly.
      await supabaseAdmin.from("courses").delete().eq("id", course.id);
      if (aErr.code === "23505") throw new Error("Bu istifadəçi adı artıq mövcuddur.");
      throw new Error(aErr.message);
    }
    return { ok: true, course_id: course.id };
  });

export const deleteCourseAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireSuper } = await import("@/lib/tenant.server");
    const { supabaseAdmin } = await requireSuper(data.token);
    const { error } = await supabaseAdmin.from("course_admins").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===========================================================================
// COURSE ADMIN — dashboard data (scoped to course)
// ===========================================================================
export const getAdminData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);

    const [course, assessments, results, questions, participants, accessKeys, procErrors, problemReports] =
      await Promise.all([
        supabaseAdmin.from("courses").select("id, name, slug, logo_url, primary_color, login_title, login_subtitle").eq("id", courseId).maybeSingle(),
        supabaseAdmin
          .from("assessments")
          .select("id, name, description, question_count, order_mode, is_open, login_mode, seat_min, seat_max, resume_after_unblock, shuffle_options, max_attempts, allow_range, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("quiz_results")
          .select("id, assessment_id, seat_number, score, total, details, attempt_number, started_at, blank_count, access_key, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("questions")
          .select("id, assessment_id, prompt, options, correct_index, position, pdf_number, source_file")
          .eq("course_id", courseId)
          .order("position", { ascending: true }),
        supabaseAdmin
          .from("participants")
          .select("id, assessment_id, seat_number, access_key, device_id, blocked, completed, attempt_count, created_at")
          .eq("course_id", courseId)
          .order("seat_number", { ascending: true }),
        supabaseAdmin
          .from("access_keys")
          .select("id, assessment_id, key_code, device_id, blocked, completed, attempt_count, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("processing_errors")
          .select("id, assessment_id, file_name, question_number, reason, raw_excerpt, question_id, status, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("problem_reports")
          .select("id, assessment_id, question_id, pdf_number, question_text, seat_number, access_key, reason, status, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false }),
      ]);

    if (assessments.error) throw new Error(assessments.error.message);
    if (results.error) throw new Error(results.error.message);
    if (questions.error) throw new Error(questions.error.message);
    if (participants.error) throw new Error(participants.error.message);
    if (accessKeys.error) throw new Error(accessKeys.error.message);
    if (procErrors.error) throw new Error(procErrors.error.message);
    if (problemReports.error) throw new Error(problemReports.error.message);

    return {
      course: course.data ?? null,
      assessments: assessments.data ?? [],
      results: results.data ?? [],
      questions: questions.data ?? [],
      participants: participants.data ?? [],
      accessKeys: accessKeys.data ?? [],
      processingErrors: procErrors.data ?? [],
      problemReports: problemReports.data ?? [],
    };
  });

// Course admin updates its own branding.
export const updateBranding = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: tok,
      logo_url: z.string().trim().max(1000).nullable().optional(),
      primary_color: z.string().trim().max(40).nullable().optional(),
      login_title: z.string().trim().max(160).nullable().optional(),
      login_subtitle: z.string().trim().max(300).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const patch: Record<string, unknown> = {};
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url || null;
    if (data.primary_color !== undefined) patch.primary_color = data.primary_color || null;
    if (data.login_title !== undefined) patch.login_title = data.login_title || null;
    if (data.login_subtitle !== undefined) patch.login_subtitle = data.login_subtitle || null;
    const { error } = await supabaseAdmin.from("courses").update(patch as never).eq("id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===========================================================================
// ASSESSMENT CRUD (course scoped)
// ===========================================================================
export const createAssessment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tok,
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional().default(""),
        question_count: z.number().int().min(1).max(1000).default(20),
        order_mode: z.enum(["random", "sequential"]).default("random"),
        login_mode: loginMode.default("seat"),
        seat_min: z.number().int().min(1).max(100000).default(1),
        seat_max: z.number().int().min(1).max(100000).default(1000),
        shuffle_options: z.boolean().default(true),
        max_attempts: z.number().int().min(0).max(100).default(0),
        allow_range: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { data: row, error } = await supabaseAdmin
      .from("assessments")
      .insert({
        course_id: courseId,
        name: data.name,
        description: data.description || null,
        question_count: data.question_count,
        order_mode: data.order_mode,
        login_mode: data.login_mode,
        seat_min: Math.min(data.seat_min, data.seat_max),
        seat_max: Math.max(data.seat_min, data.seat_max),
        shuffle_options: data.shuffle_options,
        max_attempts: data.max_attempts,
        allow_range: data.allow_range,
      } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Bu adda assessment artıq var.");
      throw new Error(error.message);
    }
    return { id: row.id };
  });

export const updateAssessment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tok,
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).optional(),
        question_count: z.number().int().min(1).max(1000).optional(),
        order_mode: z.enum(["random", "sequential"]).optional(),
        login_mode: loginMode.optional(),
        seat_min: z.number().int().min(1).max(100000).optional(),
        seat_max: z.number().int().min(1).max(100000).optional(),
        resume_after_unblock: z.boolean().optional(),
        is_open: z.boolean().optional(),
        shuffle_options: z.boolean().optional(),
        max_attempts: z.number().int().min(0).max(100).optional(),
        allow_range: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.question_count !== undefined) patch.question_count = data.question_count;
    if (data.order_mode !== undefined) patch.order_mode = data.order_mode;
    if (data.login_mode !== undefined) patch.login_mode = data.login_mode;
    if (data.seat_min !== undefined) patch.seat_min = data.seat_min;
    if (data.seat_max !== undefined) patch.seat_max = data.seat_max;
    if (data.resume_after_unblock !== undefined) patch.resume_after_unblock = data.resume_after_unblock;
    if (data.is_open !== undefined) patch.is_open = data.is_open;
    if (data.shuffle_options !== undefined) patch.shuffle_options = data.shuffle_options;
    if (data.max_attempts !== undefined) patch.max_attempts = data.max_attempts;
    if (data.allow_range !== undefined) patch.allow_range = data.allow_range;
    const { error } = await supabaseAdmin.from("assessments").update(patch as never).eq("id", data.id).eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAssessment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin.from("assessments").delete().eq("id", data.id).eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===========================================================================
// QUESTION CRUD (course scoped)
// ===========================================================================
export const saveQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tok,
        id: z.string().uuid().optional(),
        assessment_id: z.string().uuid(),
        prompt: z.string().trim().min(1).max(4000),
        options: optionSchema,
        correct_index: z.number().int().min(0).max(7),
        pdf_number: z.number().int().min(0).nullable().optional(),
        position: z.number().int().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const correct = Math.min(data.correct_index, data.options.length - 1);

    if (data.id) {
      const patch: Record<string, unknown> = {
        prompt: data.prompt,
        options: data.options,
        correct_index: correct,
      };
      if (data.pdf_number !== undefined) patch.pdf_number = data.pdf_number;
      const { error } = await supabaseAdmin.from("questions").update(patch as never).eq("id", data.id).eq("course_id", courseId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("problem_reports").delete().eq("question_id", data.id).eq("course_id", courseId);
      await supabaseAdmin
        .from("processing_errors")
        .update({ status: "resolved" } as never)
        .eq("question_id", data.id)
        .eq("course_id", courseId);
      return { ok: true };
    }

    let position = data.position;
    if (position === undefined) {
      const { data: last } = await supabaseAdmin
        .from("questions")
        .select("position")
        .eq("assessment_id", data.assessment_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      position = (last?.position ?? -1) + 1;
    } else {
      const { data: toShift } = await supabaseAdmin
        .from("questions")
        .select("id, position")
        .eq("assessment_id", data.assessment_id)
        .gte("position", position)
        .order("position", { ascending: false });
      for (const row of toShift ?? []) {
        await supabaseAdmin
          .from("questions")
          .update({ position: row.position + 1 })
          .eq("id", row.id);
      }
    }
    const { error } = await supabaseAdmin.from("questions").insert({
      course_id: courseId,
      assessment_id: data.assessment_id,
      prompt: data.prompt,
      options: data.options,
      correct_index: correct,
      pdf_number: data.pdf_number ?? null,
      position,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin.from("questions").delete().eq("id", data.id).eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, assessment_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin
      .from("questions")
      .delete()
      .eq("assessment_id", data.assessment_id)
      .eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Clear results ---------------------------------------------------------
export const clearResults = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, assessment_id: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    let q = supabaseAdmin.from("quiz_results").delete().eq("course_id", courseId);
    if (data.assessment_id) q = q.eq("assessment_id", data.assessment_id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===========================================================================
// PARTICIPANTS (course scoped)
// ===========================================================================
export const setParticipantBlocked = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: tok, id: z.string().uuid(), blocked: z.boolean(), resume: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const patch: Record<string, unknown> = { blocked: data.blocked };
    if (!data.blocked && data.resume === false) {
      patch.current_index = 0;
      patch.answers = {};
    }
    const { error } = await supabaseAdmin.from("participants").update(patch as never).eq("id", data.id).eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetParticipant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: tok, id: z.string().uuid(), new_seat: z.number().int().min(1).max(100000).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const patch: Record<string, unknown> = { device_id: null, blocked: false, current_index: 0, answers: {} };
    if (data.new_seat !== undefined) patch.seat_number = data.new_seat;
    const { error } = await supabaseAdmin.from("participants").update(patch as never).eq("id", data.id).eq("course_id", courseId);
    if (error) {
      if (error.code === "23505") throw new Error("Bu sıra nömrəsi artıq mövcuddur.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteParticipant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin.from("participants").delete().eq("id", data.id).eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===========================================================================
// ACCESS KEYS (course scoped)
// ===========================================================================
function randomKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return "K" + s;
}

export const createAccessKeys = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tok,
        assessment_id: z.string().uuid(),
        count: z.number().int().min(1).max(500).optional(),
        keys: z.array(z.string().trim().min(1).max(60)).max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    let codes: string[] = [];
    if (data.keys && data.keys.length > 0) {
      codes = data.keys.map((k) => k.trim()).filter(Boolean);
    } else {
      const n = data.count ?? 1;
      const set = new Set<string>();
      while (set.size < n) set.add(randomKey());
      codes = [...set];
    }
    const rows = codes.map((key_code) => ({ course_id: courseId, assessment_id: data.assessment_id, key_code }));
    const { error } = await supabaseAdmin.from("access_keys").upsert(rows as never, {
      onConflict: "assessment_id,key_code",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });

export const setAccessKeyBlocked = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: tok, id: z.string().uuid(), blocked: z.boolean(), resume: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const patch: Record<string, unknown> = { blocked: data.blocked };
    if (!data.blocked && data.resume === false) {
      patch.current_index = 0;
      patch.answers = {};
    }
    const { error } = await supabaseAdmin.from("access_keys").update(patch as never).eq("id", data.id).eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetAccessKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin
      .from("access_keys")
      .update({ device_id: null, blocked: false, current_index: 0, answers: {} })
      .eq("id", data.id)
      .eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAccessKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin.from("access_keys").delete().eq("id", data.id).eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===========================================================================
// PROCESSING ERRORS (course scoped)
// ===========================================================================
export const resolveProcessingError = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: tok, id: z.string().uuid(), status: z.enum(["pending", "resolved"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin
      .from("processing_errors")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProcessingError = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin.from("processing_errors").delete().eq("id", data.id).eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===========================================================================
// STUDENT — join (device-locked)
// ===========================================================================
export const joinQuiz = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        assessment_name: z.string().trim().min(1).max(120),
        course_slug: z.string().trim().max(60).nullable().optional(),
        seat_number: z.number().int().min(1).max(100000).nullable().optional(),
        access_key: z.string().trim().min(1).max(60).nullable().optional(),
        device_id: z.string().min(8).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve course context (optional slug narrows to one course).
    let courseFilterId: string | null = null;
    if (data.course_slug) {
      const { data: c } = await supabaseAdmin
        .from("courses")
        .select("id, is_active")
        .ilike("slug", data.course_slug)
        .maybeSingle();
      if (!c || !c.is_active) return { ok: false as const, reason: "Kurs tapılmadı və ya deaktivdir." };
      courseFilterId = c.id;
    }

    let aq = supabaseAdmin
      .from("assessments")
      .select("id, course_id, name, question_count, order_mode, is_open, login_mode, seat_min, seat_max, shuffle_options, max_attempts, allow_range")
      .ilike("name", data.assessment_name);
    if (courseFilterId) aq = aq.eq("course_id", courseFilterId);
    const { data: assessment } = await aq.maybeSingle();
    if (!assessment) return { ok: false as const, reason: "Bu adda assessment tapılmadı." };
    if (!assessment.is_open) return { ok: false as const, reason: "Bu assessment hazırda bağlıdır." };

    const courseId = (assessment as { course_id: string }).course_id;
    // Ensure course active.
    const { data: courseRow } = await supabaseAdmin.from("courses").select("is_active").eq("id", courseId).maybeSingle();
    if (courseRow && courseRow.is_active === false)
      return { ok: false as const, reason: "Bu kurs deaktiv edilib." };

    const mode = assessment.login_mode as "seat" | "key" | "both";
    const needSeat = mode === "seat" || mode === "both";
    const needKey = mode === "key" || mode === "both";

    if (needSeat && data.seat_number == null)
      return { ok: false as const, reason: "Sıra nömrəsini daxil edin." };
    if (needKey && !data.access_key)
      return { ok: false as const, reason: "Giriş açarını daxil edin." };

    const maxAttempts = (assessment as { max_attempts?: number }).max_attempts ?? 0;
    const shuffleOptions = (assessment as { shuffle_options?: boolean }).shuffle_options ?? true;

    const { data: devSeats } = await supabaseAdmin
      .from("participants")
      .select("seat_number")
      .eq("assessment_id", assessment.id)
      .eq("device_id", data.device_id);
    for (const row of devSeats ?? []) {
      if (!needSeat || row.seat_number !== data.seat_number) {
        return {
          ok: false as const,
          reason: `Bu cihaz artıq Sıra #${row.seat_number} üçün istifadə olunub. Başqa nömrə və ya açarla giriş mümkün deyil.`,
        };
      }
    }
    const { data: devKeys } = await supabaseAdmin
      .from("access_keys")
      .select("key_code")
      .eq("assessment_id", assessment.id)
      .eq("device_id", data.device_id);
    for (const row of devKeys ?? []) {
      const code = (data.access_key ?? "").trim().toLowerCase();
      if (!needKey || row.key_code.toLowerCase() !== code) {
        return {
          ok: false as const,
          reason: `Bu cihaz artıq "${row.key_code}" açarı üçün istifadə olunub. Başqa açar və ya nömrə ilə giriş mümkün deyil.`,
        };
      }
    }

    let participantId: string | null = null;
    let resumeIndex = 0;
    let resumeAnswers: Record<string, number> = {};
    let attemptNumber = 1;

    if (needSeat) {
      const seat = data.seat_number as number;
      if (seat < assessment.seat_min || seat > assessment.seat_max) {
        return {
          ok: false as const,
          reason: `Sıra nömrəsi ${assessment.seat_min}–${assessment.seat_max} aralığında olmalıdır.`,
        };
      }
      const { data: existing } = await supabaseAdmin
        .from("participants")
        .select("id, device_id, blocked, current_index, answers, completed, attempt_count")
        .eq("assessment_id", assessment.id)
        .eq("seat_number", seat)
        .maybeSingle();
      if (existing) {
        if (existing.blocked)
          return { ok: false as const, reason: "Girişiniz bloklanıb. Adminlə əlaqə saxlayın." };
        if (!existing.device_id) {
          await supabaseAdmin.from("participants").update({ device_id: data.device_id }).eq("id", existing.id);
        } else if (existing.device_id !== data.device_id) {
          return { ok: false as const, reason: "Bu sıra nömrəsi başqa cihaza bağlıdır." };
        }
        participantId = existing.id;
        const done = (existing as { completed?: boolean }).completed ?? false;
        const usedAttempts = (existing as { attempt_count?: number }).attempt_count ?? 0;
        if (done) {
          if (maxAttempts > 0 && usedAttempts >= maxAttempts) {
            return { ok: false as const, reason: `Cəhd limiti dolub (${maxAttempts}).` };
          }
          await supabaseAdmin
            .from("participants")
            .update({ completed: false, current_index: 0, answers: {} } as never)
            .eq("id", existing.id);
          resumeIndex = 0;
          resumeAnswers = {};
        } else {
          resumeIndex = existing.current_index ?? 0;
          resumeAnswers = (existing.answers as Record<string, number>) ?? {};
        }
        attemptNumber = usedAttempts + 1;
      } else {
        const { data: ins, error } = await supabaseAdmin
          .from("participants")
          .insert({
            course_id: courseId,
            assessment_id: assessment.id,
            seat_number: seat,
            access_key: data.access_key ?? null,
            device_id: data.device_id,
          } as never)
          .select("id")
          .single();
        if (error) {
          if (error.code === "23505")
            return { ok: false as const, reason: "Bu sıra nömrəsi artıq tutulub." };
          throw new Error(error.message);
        }
        participantId = ins.id;
      }
    }

    let accessKeyId: string | null = null;
    if (needKey) {
      const code = (data.access_key as string).trim();
      const { data: keyRow } = await supabaseAdmin
        .from("access_keys")
        .select("id, device_id, blocked, current_index, answers, completed, attempt_count")
        .eq("assessment_id", assessment.id)
        .ilike("key_code", code)
        .maybeSingle();
      if (!keyRow) return { ok: false as const, reason: "Giriş açarı yanlışdır." };
      if (keyRow.blocked)
        return { ok: false as const, reason: "Bu açar bloklanıb. Adminlə əlaqə saxlayın." };
      if (!keyRow.device_id) {
        await supabaseAdmin.from("access_keys").update({ device_id: data.device_id }).eq("id", keyRow.id);
      } else if (keyRow.device_id !== data.device_id) {
        return { ok: false as const, reason: "Bu açar başqa cihaza bağlıdır." };
      }
      accessKeyId = keyRow.id;
      const kDone = (keyRow as { completed?: boolean }).completed ?? false;
      const kUsed = (keyRow as { attempt_count?: number }).attempt_count ?? 0;
      if (kDone) {
        if (maxAttempts > 0 && kUsed >= maxAttempts) {
          return { ok: false as const, reason: `Cəhd limiti dolub (${maxAttempts}).` };
        }
        await supabaseAdmin
          .from("access_keys")
          .update({ completed: false, current_index: 0, answers: {} } as never)
          .eq("id", keyRow.id);
        if (!needSeat) {
          resumeIndex = 0;
          resumeAnswers = {};
        }
      } else if (!needSeat) {
        resumeIndex = keyRow.current_index ?? 0;
        resumeAnswers = (keyRow.answers as Record<string, number>) ?? {};
      }
      if (!needSeat) attemptNumber = kUsed + 1;
    }

    return {
      ok: true as const,
      assessment: {
        id: assessment.id,
        name: assessment.name,
        question_count: assessment.question_count,
        order_mode: assessment.order_mode,
        shuffle_options: shuffleOptions,
        max_attempts: maxAttempts,
        allow_range: (assessment as { allow_range?: boolean }).allow_range ?? true,
      },
      participantId,
      accessKeyId,
      resumeIndex,
      resumeAnswers,
      attemptNumber,
      startedAt: new Date().toISOString(),
    };
  });

export const saveProgress = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        participant_id: z.string().uuid().nullable().optional(),
        access_key_id: z.string().uuid().nullable().optional(),
        current_index: z.number().int().min(0).max(2000),
        answers: z.record(z.string(), z.number().int()),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch = { current_index: data.current_index, answers: data.answers };
    if (data.participant_id) {
      await supabaseAdmin.from("participants").update(patch as never).eq("id", data.participant_id);
    }
    if (data.access_key_id) {
      await supabaseAdmin.from("access_keys").update(patch as never).eq("id", data.access_key_id);
    }
    return { ok: true };
  });

export const checkBlocked = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        participant_id: z.string().uuid().nullable().optional(),
        access_key_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let blocked = false;
    if (data.participant_id) {
      const { data: p } = await supabaseAdmin
        .from("participants")
        .select("blocked")
        .eq("id", data.participant_id)
        .maybeSingle();
      if (p?.blocked) blocked = true;
    }
    if (data.access_key_id) {
      const { data: k } = await supabaseAdmin
        .from("access_keys")
        .select("blocked")
        .eq("id", data.access_key_id)
        .maybeSingle();
      if (k?.blocked) blocked = true;
    }
    return { blocked };
  });

// ===========================================================================
// MESSAGES (admin, course scoped) + reports (student)
// ===========================================================================
export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tok,
        assessment_id: z.string().uuid().nullable().optional(),
        seat_number: z.number().int().min(1).max(100000).nullable().optional(),
        body: z.string().trim().min(1).max(1000),
        kind: z.enum(["info", "warning"]).default("info"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin.from("admin_messages").insert({
      course_id: courseId,
      assessment_id: data.assessment_id ?? null,
      seat_number: data.seat_number ?? null,
      body: data.body,
      kind: data.kind,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reportProblem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        assessment_id: z.string().uuid(),
        seat_number: z.number().int().min(1).max(100000).nullable().optional(),
        pdf_number: z.number().int().nullable().optional(),
        question_id: z.string().uuid().nullable().optional(),
        question_text: z.string().max(4000).nullable().optional(),
        access_key: z.string().max(60).nullable().optional(),
        body: z.string().trim().min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: a } = await supabaseAdmin.from("assessments").select("course_id").eq("id", data.assessment_id).maybeSingle();
    const courseId = (a as { course_id?: string } | null)?.course_id ?? null;
    await supabaseAdmin.from("problem_reports").insert({
      course_id: courseId,
      assessment_id: data.assessment_id,
      question_id: data.question_id ?? null,
      pdf_number: data.pdf_number ?? null,
      question_text: data.question_text ?? null,
      seat_number: data.seat_number ?? null,
      access_key: data.access_key ?? null,
      reason: data.body,
    } as never);
    const prefix = data.pdf_number != null ? `[PDF #${data.pdf_number}] ` : "";
    const seat = data.seat_number != null ? `(Sıra #${data.seat_number}) ` : "";
    const { error } = await supabaseAdmin.from("admin_messages").insert({
      course_id: courseId,
      assessment_id: data.assessment_id,
      seat_number: null,
      body: `🚩 İstifadəçidən bildiriş ${seat}${prefix}${data.body}`,
      kind: "warning",
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolveProblemReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: tok, id: z.string().uuid(), status: z.enum(["pending", "resolved"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin
      .from("problem_reports")
      .update({ status: data.status } as never)
      .eq("id", data.id)
      .eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProblemReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tok, id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);
    const { error } = await supabaseAdmin.from("problem_reports").delete().eq("id", data.id).eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===========================================================================
// FINISH ATTEMPT (student)
// ===========================================================================
export const finishAttempt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        assessment_id: z.string().uuid(),
        participant_id: z.string().uuid().nullable().optional(),
        access_key_id: z.string().uuid().nullable().optional(),
        seat_number: z.number().int().min(0).max(100000).nullable().optional(),
        access_key: z.string().max(60).nullable().optional(),
        attempt_number: z.number().int().min(1).max(1000).default(1),
        started_at: z.string().max(40).nullable().optional(),
        answers: z
          .array(
            z.object({
              question_id: z.string().uuid(),
              chosen: z.number().int().min(0).max(50).nullable(),
            }),
          )
          .max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: a } = await supabaseAdmin.from("assessments").select("course_id").eq("id", data.assessment_id).maybeSingle();
    const courseId = (a as { course_id?: string } | null)?.course_id ?? null;

    const ids = data.answers.map((a2) => a2.question_id);
    const chosenMap = new Map(data.answers.map((a2) => [a2.question_id, a2.chosen]));
    const { data: qs, error: qErr } = await supabaseAdmin
      .from("questions")
      .select("id, prompt, options, correct_index, pdf_number")
      .in("id", ids.length ? ids : [NIL_UUID]);
    if (qErr) throw new Error(qErr.message);
    const qById = new Map((qs ?? []).map((q) => [q.id as string, q]));
    let score = 0;
    let blank_count = 0;
    const details = ids.map((id) => {
      const q = qById.get(id);
      const opts = Array.isArray(q?.options) ? (q!.options as string[]) : [];
      const correct = typeof q?.correct_index === "number" ? q!.correct_index : 0;
      const chosen = chosenMap.get(id) ?? null;
      if (chosen === null || chosen === undefined) blank_count++;
      else if (chosen === correct) score++;
      return { prompt: q?.prompt ?? "", pdf_number: q?.pdf_number ?? null, options: opts, chosen, correct };
    });
    const total = ids.length;
    const { error } = await supabaseAdmin.from("quiz_results").insert({
      course_id: courseId,
      assessment_id: data.assessment_id,
      seat_number: data.seat_number ?? 0,
      access_key: data.access_key ?? null,
      score,
      total,
      blank_count,
      attempt_number: data.attempt_number,
      started_at: data.started_at ?? null,
      details: details as never,
    } as never);
    if (error) throw new Error(error.message);
    if (data.participant_id) {
      await supabaseAdmin
        .from("participants")
        .update({ completed: true, attempt_count: data.attempt_number } as never)
        .eq("id", data.participant_id);
    }
    if (data.access_key_id) {
      await supabaseAdmin
        .from("access_keys")
        .update({ completed: true, attempt_count: data.attempt_number } as never)
        .eq("id", data.access_key_id);
    }
    return { ok: true, score, total, blank_count, details };
  });

// ===========================================================================
// AI EXTRACTION
// ===========================================================================
type ExtractedQ = {
  prompt: string;
  options: string[];
  correct_index: number;
  pdf_number: number | null;
};

async function callExtractChunk(
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >,
): Promise<unknown> {
  const { callGateway } = await import("@/lib/ai-gateway.server");
  const system =
    "Sən PDF/Word sənədlərindən test (quiz) suallarını maksimum dəqiqliklə çıxaran köməkçisən. " +
    "Mənbədə hazır suallar və cavab variantları var (mətn və ya skan/şəkil ola bilər). " +
    "Hər sualın mənbədəki orijinal nömrəsini, tam mətnini, bütün variantlarını və düzgün cavabı diqqətlə oxu. " +
    "Cavabları yalnız Azərbaycan dilində, JSON formatında qaytar.";
  const instruction =
    "Bu mənbədəki BÜTÜN sualları çıxar. Nəticəni belə JSON kimi qaytar: " +
    '{"questions":[{"pdf_number":1,"prompt":"sualın tam mətni","options":["A variantı","B variantı","C variantı","D variantı"],"correct_index":0}]}. ' +
    "Qaydalar: pdf_number mənbədə yazılan orijinal sual nömrəsidir (tapılmasa null qoy); " +
    "hər sualın 2-6 variantı olsun; variantları olduğu kimi götür; " +
    "correct_index düzgün cavabın 0-dan başlayan indeksidir; mənbədə düzgün cavab işarələnibsə ona əsaslan, " +
    "açıq deyilsə məntiqlə müəyyən et. Heç bir sualı buraxma. Yalnız JSON qaytar.";

  const raw = await callGateway({
    model: "google/gemini-2.5-flash",
    jsonMode: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [{ type: "text", text: instruction }, ...content] },
    ],
  });
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function parseChunk(parsed: unknown): { good: ExtractedQ[]; issues: { pdf_number: number | null; reason: string; excerpt: string }[] } {
  const good: ExtractedQ[] = [];
  const issues: { pdf_number: number | null; reason: string; excerpt: string }[] = [];
  const arr =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : [];
  for (const item of arr) {
    const q = item as Partial<ExtractedQ>;
    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
    const options = Array.isArray(q.options) ? q.options.filter((o) => typeof o === "string" && o.trim()).map((o) => o.trim()) : [];
    const pdfNum = typeof q.pdf_number === "number" ? q.pdf_number : null;
    const excerpt = prompt.slice(0, 200);
    if (!prompt) {
      issues.push({ pdf_number: pdfNum, reason: "Sual mətni boş və ya natamam çıxarıldı.", excerpt });
      continue;
    }
    if (options.length < 2) {
      issues.push({ pdf_number: pdfNum, reason: "Variantlar düzgün oxunmayıb (2-dən az variant).", excerpt });
      continue;
    }
    let correct = typeof q.correct_index === "number" ? q.correct_index : -1;
    if (correct < 0 || correct >= options.length) {
      issues.push({ pdf_number: pdfNum, reason: "Düzgün cavab tapılmadı — yoxlama tələb olunur.", excerpt });
      correct = 0;
    }
    if (pdfNum == null) {
      issues.push({ pdf_number: null, reason: "PDF sual nömrəsi tapılmadı.", excerpt });
    }
    good.push({ prompt, options, correct_index: correct, pdf_number: pdfNum });
  }
  return { good, issues };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const extractQuiz = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tok,
        assessment_id: z.string().uuid(),
        source_file: z.string().max(300).optional().default(""),
        images: z.array(z.string().min(1)).max(60).optional().default([]),
        text: z.string().max(400000).optional().default(""),
        replace: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireCourse } = await import("@/lib/tenant.server");
    const { courseId, supabaseAdmin } = await requireCourse(data.token);

    const allGood: ExtractedQ[] = [];
    const allIssues: { pdf_number: number | null; reason: string; excerpt: string }[] = [];

    if (data.images.length > 0) {
      const batches = chunkArray(data.images, 5);
      for (const batch of batches) {
        try {
          const parsed = await callExtractChunk(
            batch.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          );
          const { good, issues } = parseChunk(parsed);
          allGood.push(...good);
          allIssues.push(...issues);
        } catch {
          allIssues.push({ pdf_number: null, reason: "Bu səhifə dəstəsi oxunmadı (OCR/AI xətası).", excerpt: "" });
        }
      }
    } else if (data.text.trim()) {
      const text = data.text;
      const chunks: string[] = [];
      const size = 12000;
      for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
      for (const c of chunks) {
        try {
          const parsed = await callExtractChunk([{ type: "text", text: "MƏTN:\n" + c }]);
          const { good, issues } = parseChunk(parsed);
          allGood.push(...good);
          allIssues.push(...issues);
        } catch {
          allIssues.push({ pdf_number: null, reason: "Mətn hissəsi emal olunmadı (AI xətası).", excerpt: "" });
        }
      }
    } else {
      throw new Error("Emal üçün məzmun tapılmadı.");
    }

    if (allGood.length === 0) {
      if (allIssues.length > 0) {
        await supabaseAdmin.from("processing_errors").insert(
          allIssues.map((i) => ({
            course_id: courseId,
            assessment_id: data.assessment_id,
            file_name: data.source_file || null,
            question_number: i.pdf_number,
            reason: i.reason,
            raw_excerpt: i.excerpt || null,
          })) as never,
        );
      }
      throw new Error("Sənəddən sual çıxarılmadı. Daha aydın fayl yoxlayın.");
    }

    let offset = 0;
    if (data.replace) {
      await supabaseAdmin.from("questions").delete().eq("assessment_id", data.assessment_id).eq("course_id", courseId);
      await supabaseAdmin.from("processing_errors").delete().eq("assessment_id", data.assessment_id).eq("course_id", courseId);
    } else {
      const { count } = await supabaseAdmin
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("assessment_id", data.assessment_id);
      offset = count ?? 0;
    }

    const rows = allGood.map((q, i) => ({
      course_id: courseId,
      assessment_id: data.assessment_id,
      prompt: q.prompt,
      options: q.options,
      correct_index: Math.min(q.correct_index, q.options.length - 1),
      pdf_number: q.pdf_number,
      source_file: data.source_file || null,
      position: offset + i,
    }));

    const { error } = await supabaseAdmin.from("questions").insert(rows as never);
    if (error) throw new Error(error.message);

    if (allIssues.length > 0) {
      await supabaseAdmin.from("processing_errors").insert(
        allIssues.map((i) => ({
          course_id: courseId,
          assessment_id: data.assessment_id,
          file_name: data.source_file || null,
          question_number: i.pdf_number,
          reason: i.reason,
          raw_excerpt: i.excerpt || null,
        })) as never,
      );
    }

    return { count: rows.length, errors: allIssues.length };
  });
