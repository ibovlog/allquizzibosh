import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DEFAULT_ADMIN_PASSWORD = "admin123";

function checkPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  return password === expected;
}

// --- Admin login -----------------------------------------------------------
export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    return { ok: checkPassword(data.password) };
  });

// --- Get admin dashboard data ---------------------------------------------
export const getAdminData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [results, questions] = await Promise.all([
      supabaseAdmin
        .from("quiz_results")
        .select("id, seat_number, score, total, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("questions")
        .select("id, prompt, options, correct_index, position")
        .order("position", { ascending: true }),
    ]);

    if (results.error) throw new Error(results.error.message);
    if (questions.error) throw new Error(questions.error.message);

    return { results: results.data ?? [], questions: questions.data ?? [] };
  });

// --- Clear all questions ---------------------------------------------------
export const clearQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("questions")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Clear all results -----------------------------------------------------
export const clearResults = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!checkPassword(data.password)) throw new Error("UNAUTHORIZED");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("quiz_results")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Extract quiz from uploaded PDF page images ----------------------------
export const extractQuiz = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        password: z.string().min(1).max(200),
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
      prompt: q.prompt,
      options: q.options,
      correct_index: Math.min(q.correct_index, q.options.length - 1),
      position: i,
    }));

    if (data.replace) {
      await supabaseAdmin
        .from("questions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      const { count } = await supabaseAdmin
        .from("questions")
        .select("id", { count: "exact", head: true });
      const offset = count ?? 0;
      questions.forEach((q, i) => (q.position = offset + i));
    }

    const { error } = await supabaseAdmin.from("questions").insert(questions);
    if (error) throw new Error(error.message);

    return { count: questions.length };
  });