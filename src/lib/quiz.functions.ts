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

    const [assessments, results, questions, participants] = await Promise.all([
      supabaseAdmin
        .from("assessments")
        .select("id, name, description, question_count, order_mode, is_open, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("quiz_results")
        .select("id, assessment_id, seat_number, score, total, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("questions")
        .select("id, assessment_id, prompt, options, correct_index, position")
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("participants")
        .select("id, assessment_id, seat_number, device_id, blocked, created_at")
        .order("seat_number", { ascending: true }),
    ]);

    if (assessments.error) throw new Error(assessments.error.message);
    if (results.error) throw new Error(results.error.message);
    if (questions.error) throw new Error(questions.error.message);
    if (participants.error) throw new Error(participants.error.message);

    return {
      assessments: assessments.data ?? [],
      results: results.data ?? [],
      questions: questions.data ?? [],
      participants: participants.data ?? [],
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
        question_count: z.number().int().min(1).max(200).default(20),
        order_mode: z.enum(["random", "sequential"]).default("random"),
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
        question_count: z.number().int().min(1).max(200).optional(),
        order_mode: z.enum(["random", "sequential"]).optional(),
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
        position: z.number().int().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const correct = Math.min(data.correct_index, data.options.length - 1);

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("questions")
        .update({ prompt: data.prompt, options: data.options, correct_index: correct })
        .eq("id", data.id);
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
      // shift later questions to make room
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

// --- Clear all questions for an assessment ---------------------------------
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
    z
      .object({ password: pw, assessment_id: z.string().uuid().optional() })
      .parse(input),
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
    z.object({ password: pw, id: z.string().uuid(), blocked: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("participants")
      .update({ blocked: data.blocked })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetParticipant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
        id: z.string().uuid(),
        new_seat: z.number().int().min(1).max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { device_id: null, blocked: false };
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

// --- Join (device-locked seat) — called by students ------------------------
export const joinQuiz = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        assessment_name: z.string().trim().min(1).max(120),
        seat_number: z.number().int().min(1).max(1000),
        device_id: z.string().min(8).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assessment } = await supabaseAdmin
      .from("assessments")
      .select("id, name, question_count, order_mode, is_open")
      .ilike("name", data.assessment_name)
      .maybeSingle();
    if (!assessment) return { ok: false as const, reason: "Bu adda assessment tapılmadı." };
    if (!assessment.is_open)
      return { ok: false as const, reason: "Bu assessment hazırda bağlıdır." };

    const { data: existing } = await supabaseAdmin
      .from("participants")
      .select("id, device_id, blocked")
      .eq("assessment_id", assessment.id)
      .eq("seat_number", data.seat_number)
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
        return {
          ok: false as const,
          reason: "Bu sıra nömrəsi başqa cihaza bağlıdır.",
        };
      }
    } else {
      const { error } = await supabaseAdmin.from("participants").insert({
        assessment_id: assessment.id,
        seat_number: data.seat_number,
        device_id: data.device_id,
      });
      if (error) {
        if (error.code === "23505")
          return { ok: false as const, reason: "Bu sıra nömrəsi artıq tutulub." };
        throw new Error(error.message);
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
    };
  });

// --- Send realtime message -------------------------------------------------
export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
        assessment_id: z.string().uuid().nullable().optional(),
        seat_number: z.number().int().min(1).max(1000).nullable().optional(),
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

// --- Extract quiz from uploaded PDF page images ----------------------------
export const extractQuiz = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: pw,
        assessment_id: z.string().uuid(),
        images: z.array(z.string().min(1)).min(1).max(40),
        replace: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");

    const { callGateway } = await import("@/lib/ai-gateway.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const system =
      "Sən PDF səhifələrindən test (quiz) suallarını çıxaran köməkçisən. " +
      "Verilən şəkillərdə hazır suallar və cavablar var. Onları diqqətlə oxu (mətn və ya skan/şəkil ola bilər). " +
      "Hər sual üçün düzgün cavabı müəyyən et. Cavablar yalnız Azərbaycan dilində, JSON formatında qaytar.";

    const instruction =
      "Bu şəkillərdəki BÜTÜN sualları çıxar. Nəticəni belə JSON kimi qaytar: " +
      '{"questions":[{"prompt":"sualın tam mətni","options":["A variantı","B variantı","C variantı","D variantı"],"correct_index":0}]}. ' +
      "Qaydalar: hər sualın 2-5 variant cavabı olsun; əgər mənbədə variantlar göstərilibsə onları olduğu kimi götür; " +
      "correct_index düzgün cavabın 0-dan başlayan indeksidir; əgər mənbədə yalnız bir düzgün cavab verilibsə, " +
      "onu options-a daxil et və ona uyğun məntiqli digər variantlar (distraktorlar) əlavə et. " +
      "Yalnız JSON qaytar, başqa heç nə yazma.";

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: instruction }];
    for (const img of data.images) {
      content.push({ type: "image_url", image_url: { url: img } });
    }

    const raw = await callGateway({
      model: "google/gemini-2.5-flash",
      jsonMode: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    });

    let parsed: unknown;
    try {
      const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI cavabını oxumaq mümkün olmadı. Yenidən cəhd edin.");
    }

    const schema = z.object({
      questions: z
        .array(
          z.object({
            prompt: z.string().min(1),
            options: z.array(z.string().min(1)).min(2).max(6),
            correct_index: z.number().int().min(0),
          }),
        )
        .min(1),
    });

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error("AI suallardan düzgün quiz qura bilmədi. Daha aydın PDF cəhd edin.");
    }

    const questions = result.data.questions.map((q, i) => ({
      assessment_id: data.assessment_id,
      prompt: q.prompt,
      options: q.options,
      correct_index: Math.min(q.correct_index, q.options.length - 1),
      position: i,
    }));

    if (data.replace) {
      await supabaseAdmin
        .from("questions")
        .delete()
        .eq("assessment_id", data.assessment_id);
    } else {
      const { count } = await supabaseAdmin
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("assessment_id", data.assessment_id);
      const offset = count ?? 0;
      questions.forEach((q, i) => (q.position = offset + i));
    }

    const { error } = await supabaseAdmin.from("questions").insert(questions);
    if (error) throw new Error(error.message);

    return { count: questions.length };
  });