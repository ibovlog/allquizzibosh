import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DEFAULT_ADMIN_PASSWORD = "admin123";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function checkPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  return password === expected;
}

const pw = z.string().min(1).max(200);
const optionSchema = z.array(z.string().min(1).max(2000)).min(2).max(8);
const loginMode = z.enum(["seat", "key", "both"]);

// --- Admin login -----------------------------------------------------------
export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ password: pw }).parse(input))
  .handler(async ({ data }) => {
    return { ok: checkPassword(data.password) };
  });

// --- Get admin dashboard data ---------------------------------------------
export const getAdminData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ password: pw }).parse(input))
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [assessments, results, questions, participants, accessKeys, procErrors] =
      await Promise.all([
        supabaseAdmin
          .from("assessments")
          .select(
            "id, name, description, question_count, order_mode, is_open, login_mode, seat_min, seat_max, resume_after_unblock, created_at",
          )
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("quiz_results")
          .select("id, assessment_id, seat_number, score, total, details, created_at")
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("questions")
          .select("id, assessment_id, prompt, options, correct_index, position, pdf_number, source_file")
          .order("position", { ascending: true }),
        supabaseAdmin
          .from("participants")
          .select("id, assessment_id, seat_number, access_key, device_id, blocked, created_at")
          .order("seat_number", { ascending: true }),
        supabaseAdmin
          .from("access_keys")
          .select("id, assessment_id, key_code, device_id, blocked, created_at")
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("processing_errors")
          .select("id, assessment_id, file_name, question_number, reason, raw_excerpt, question_id, status, created_at")
          .order("created_at", { ascending: false }),
      ]);

    if (assessments.error) throw new Error(assessments.error.message);
    if (results.error) throw new Error(results.error.message);
    if (questions.error) throw new Error(questions.error.message);
    if (participants.error) throw new Error(participants.error.message);
    if (accessKeys.error) throw new Error(accessKeys.error.message);
    if (procErrors.error) throw new Error(procErrors.error.message);

    return {
      assessments: assessments.data ?? [],
      results: results.data ?? [],
      questions: questions.data ?? [],
      participants: participants.data ?? [],
      accessKeys: accessKeys.data ?? [],
      processingErrors: procErrors.data ?? [],
    };
  });

// --- Assessment CRUD -------------------------------------------------------
export const createAssessment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional().default(""),
        question_count: z.number().int().min(1).max(1000).default(20),
        order_mode: z.enum(["random", "sequential"]).default("random"),
        login_mode: loginMode.default("seat"),
        seat_min: z.number().int().min(1).max(100000).default(1),
        seat_max: z.number().int().min(1).max(100000).default(1000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("assessments")
      .insert({
        name: data.name,
        description: data.description || null,
        question_count: data.question_count,
        order_mode: data.order_mode,
        login_mode: data.login_mode,
        seat_min: Math.min(data.seat_min, data.seat_max),
        seat_max: Math.max(data.seat_min, data.seat_max),
      })
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
        password: pw,
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
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { error } = await supabaseAdmin.from("assessments").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAssessment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: pw, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("assessments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Question CRUD ---------------------------------------------------------
export const saveQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
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
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const correct = Math.min(data.correct_index, data.options.length - 1);

    if (data.id) {
      const patch: Record<string, unknown> = {
        prompt: data.prompt,
        options: data.options,
        correct_index: correct,
      };
      if (data.pdf_number !== undefined) patch.pdf_number = data.pdf_number;
      const { error } = await supabaseAdmin.from("questions").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
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
      assessment_id: data.assessment_id,
      prompt: data.prompt,
      options: data.options,
      correct_index: correct,
      pdf_number: data.pdf_number ?? null,
      position,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: pw, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("questions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: pw, assessment_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("questions")
      .delete()
      .eq("assessment_id", data.assessment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Clear results ---------------------------------------------------------
export const clearResults = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: pw, assessment_id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("quiz_results").delete();
    q = data.assessment_id ? q.eq("assessment_id", data.assessment_id) : q.neq("id", NIL_UUID);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Participant: block / unblock / reset / change seat --------------------
export const setParticipantBlocked = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
        id: z.string().uuid(),
        blocked: z.boolean(),
        resume: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { blocked: data.blocked };
    // When unblocking without resume, clear saved progress so they restart.
    if (!data.blocked && data.resume === false) {
      patch.current_index = 0;
      patch.answers = {};
    }
    const { error } = await supabaseAdmin.from("participants").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetParticipant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
        id: z.string().uuid(),
        new_seat: z.number().int().min(1).max(100000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {
      device_id: null,
      blocked: false,
      current_index: 0,
      answers: {},
    };
    if (data.new_seat !== undefined) patch.seat_number = data.new_seat;
    const { error } = await supabaseAdmin.from("participants").update(patch).eq("id", data.id);
    if (error) {
      if (error.code === "23505") throw new Error("Bu sıra nömrəsi artıq mövcuddur.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteParticipant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: pw, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("participants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Access keys -----------------------------------------------------------
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
        password: pw,
        assessment_id: z.string().uuid(),
        count: z.number().int().min(1).max(500).optional(),
        keys: z.array(z.string().trim().min(1).max(60)).max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let codes: string[] = [];
    if (data.keys && data.keys.length > 0) {
      codes = data.keys.map((k) => k.trim()).filter(Boolean);
    } else {
      const n = data.count ?? 1;
      const set = new Set<string>();
      while (set.size < n) set.add(randomKey());
      codes = [...set];
    }
    const rows = codes.map((key_code) => ({ assessment_id: data.assessment_id, key_code }));
    const { error } = await supabaseAdmin.from("access_keys").upsert(rows, {
      onConflict: "assessment_id,key_code",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });

export const setAccessKeyBlocked = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
        id: z.string().uuid(),
        blocked: z.boolean(),
        resume: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { blocked: data.blocked };
    if (!data.blocked && data.resume === false) {
      patch.current_index = 0;
      patch.answers = {};
    }
    const { error } = await supabaseAdmin.from("access_keys").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetAccessKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: pw, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("access_keys")
      .update({ device_id: null, blocked: false, current_index: 0, answers: {} })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAccessKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: pw, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("access_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Processing errors -----------------------------------------------------
export const resolveProcessingError = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ password: pw, id: z.string().uuid(), status: z.enum(["pending", "resolved"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("processing_errors")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProcessingError = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: pw, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("processing_errors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Join (device-locked) — called by students -----------------------------
export const joinQuiz = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        assessment_name: z.string().trim().min(1).max(120),
        seat_number: z.number().int().min(1).max(100000).nullable().optional(),
        access_key: z.string().trim().min(1).max(60).nullable().optional(),
        device_id: z.string().min(8).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assessment } = await supabaseAdmin
      .from("assessments")
      .select("id, name, question_count, order_mode, is_open, login_mode, seat_min, seat_max")
      .ilike("name", data.assessment_name)
      .maybeSingle();
    if (!assessment) return { ok: false as const, reason: "Bu adda assessment tapılmadı." };
    if (!assessment.is_open)
      return { ok: false as const, reason: "Bu assessment hazırda bağlıdır." };

    const mode = assessment.login_mode as "seat" | "key" | "both";
    const needSeat = mode === "seat" || mode === "both";
    const needKey = mode === "key" || mode === "both";

    if (needSeat && (data.seat_number == null))
      return { ok: false as const, reason: "Sıra nömrəsini daxil edin." };
    if (needKey && (!data.access_key))
      return { ok: false as const, reason: "Giriş açarını daxil edin." };

    let participantId: string | null = null;
    let resumeIndex = 0;
    let resumeAnswers: Record<string, number> = {};

    // --- Seat validation + device lock ---
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
        .select("id, device_id, blocked, current_index, answers")
        .eq("assessment_id", assessment.id)
        .eq("seat_number", seat)
        .maybeSingle();
      if (existing) {
        if (existing.blocked)
          return { ok: false as const, reason: "Girişiniz bloklanıb. Adminlə əlaqə saxlayın." };
        if (!existing.device_id) {
          await supabaseAdmin
            .from("participants")
            .update({ device_id: data.device_id })
            .eq("id", existing.id);
        } else if (existing.device_id !== data.device_id) {
          return { ok: false as const, reason: "Bu sıra nömrəsi başqa cihaza bağlıdır." };
        }
        participantId = existing.id;
        resumeIndex = existing.current_index ?? 0;
        resumeAnswers = (existing.answers as Record<string, number>) ?? {};
      } else {
        const { data: ins, error } = await supabaseAdmin
          .from("participants")
          .insert({
            assessment_id: assessment.id,
            seat_number: seat,
            access_key: data.access_key ?? null,
            device_id: data.device_id,
          })
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

    // --- Access key validation + device lock ---
    let accessKeyId: string | null = null;
    if (needKey) {
      const code = (data.access_key as string).trim();
      const { data: keyRow } = await supabaseAdmin
        .from("access_keys")
        .select("id, device_id, blocked, current_index, answers")
        .eq("assessment_id", assessment.id)
        .ilike("key_code", code)
        .maybeSingle();
      if (!keyRow) return { ok: false as const, reason: "Giriş açarı yanlışdır." };
      if (keyRow.blocked)
        return { ok: false as const, reason: "Bu açar bloklanıb. Adminlə əlaqə saxlayın." };
      if (!keyRow.device_id) {
        await supabaseAdmin
          .from("access_keys")
          .update({ device_id: data.device_id })
          .eq("id", keyRow.id);
      } else if (keyRow.device_id !== data.device_id) {
        return { ok: false as const, reason: "Bu açar başqa cihaza bağlıdır." };
      }
      accessKeyId = keyRow.id;
      if (!needSeat) {
        resumeIndex = keyRow.current_index ?? 0;
        resumeAnswers = (keyRow.answers as Record<string, number>) ?? {};
      }
    }

    return {
      ok: true as const,
      assessment: {
        id: assessment.id,
        name: assessment.name,
        question_count: assessment.question_count,
        order_mode: assessment.order_mode,
      },
      participantId,
      accessKeyId,
      resumeIndex,
      resumeAnswers,
    };
  });

// --- Save student progress (resume support) --------------------------------
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
      await supabaseAdmin.from("participants").update(patch).eq("id", data.participant_id);
    }
    if (data.access_key_id) {
      await supabaseAdmin.from("access_keys").update(patch).eq("id", data.access_key_id);
    }
    return { ok: true };
  });

// --- Check live block status (polling fallback) ----------------------------
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

// --- Send realtime message -------------------------------------------------
export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
        assessment_id: z.string().uuid().nullable().optional(),
        seat_number: z.number().int().min(1).max(100000).nullable().optional(),
        body: z.string().trim().min(1).max(1000),
        kind: z.enum(["info", "warning"]).default("info"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_messages").insert({
      assessment_id: data.assessment_id ?? null,
      seat_number: data.seat_number ?? null,
      body: data.body,
      kind: data.kind,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Report a problem (student) -> admin message ---------------------------
export const reportProblem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        assessment_id: z.string().uuid(),
        seat_number: z.number().int().min(1).max(100000).nullable().optional(),
        pdf_number: z.number().int().nullable().optional(),
        body: z.string().trim().min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const prefix = data.pdf_number != null ? `[PDF #${data.pdf_number}] ` : "";
    const seat = data.seat_number != null ? `(Sıra #${data.seat_number}) ` : "";
    const { error } = await supabaseAdmin.from("admin_messages").insert({
      assessment_id: data.assessment_id,
      seat_number: null,
      body: `🚩 İstifadəçidən bildiriş ${seat}${prefix}${data.body}`,
      kind: "warning",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- AI extraction helpers -------------------------------------------------
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
      ? ((parsed as { questions: unknown[] }).questions)
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

// --- Extract quiz from uploaded PDF images or document text ----------------
export const extractQuiz = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
        assessment_id: z.string().uuid(),
        source_file: z.string().max(300).optional().default(""),
        images: z.array(z.string().min(1)).max(60).optional().default([]),
        text: z.string().max(400000).optional().default(""),
        replace: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const allGood: ExtractedQ[] = [];
    const allIssues: { pdf_number: number | null; reason: string; excerpt: string }[] = [];

    if (data.images.length > 0) {
      // batch pages (5 per call) for accuracy on big PDFs
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
      // chunk long text by ~12000 chars on blank lines
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
      // still log the issues so admin sees them
      if (allIssues.length > 0) {
        await supabaseAdmin.from("processing_errors").insert(
          allIssues.map((i) => ({
            assessment_id: data.assessment_id,
            file_name: data.source_file || null,
            question_number: i.pdf_number,
            reason: i.reason,
            raw_excerpt: i.excerpt || null,
          })),
        );
      }
      throw new Error("Sənəddən sual çıxarılmadı. Daha aydın fayl yoxlayın.");
    }

    let offset = 0;
    if (data.replace) {
      await supabaseAdmin.from("questions").delete().eq("assessment_id", data.assessment_id);
      await supabaseAdmin.from("processing_errors").delete().eq("assessment_id", data.assessment_id);
    } else {
      const { count } = await supabaseAdmin
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("assessment_id", data.assessment_id);
      offset = count ?? 0;
    }

    const rows = allGood.map((q, i) => ({
      assessment_id: data.assessment_id,
      prompt: q.prompt,
      options: q.options,
      correct_index: Math.min(q.correct_index, q.options.length - 1),
      pdf_number: q.pdf_number,
      source_file: data.source_file || null,
      position: offset + i,
    }));

    const { error } = await supabaseAdmin.from("questions").insert(rows);
    if (error) throw new Error(error.message);

    if (allIssues.length > 0) {
      await supabaseAdmin.from("processing_errors").insert(
        allIssues.map((i) => ({
          assessment_id: data.assessment_id,
          file_name: data.source_file || null,
          question_number: i.pdf_number,
          reason: i.reason,
          raw_excerpt: i.excerpt || null,
        })),
      );
    }

    return { count: rows.length, errors: allIssues.length };
  });