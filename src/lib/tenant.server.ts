// Server-only tenant/role guards shared by quiz server functions.
import { verifySession } from "./auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Requires a valid session that is scoped to a course (course admin, or a
// super admin who has "entered" a course). Returns the effective course id.
export async function requireCourse(token: string) {
  const session = await verifySession(token);
  if (!session.courseId) throw new Error("NO_COURSE");
  return { session, courseId: session.courseId, supabaseAdmin };
}

// Requires a super admin session (system owner).
export async function requireSuper(token: string) {
  const session = await verifySession(token);
  if (session.role !== "super") throw new Error("FORBIDDEN");
  return { session, supabaseAdmin };
}

// Any valid admin session (super or course).
export async function requireAdmin(token: string) {
  const session = await verifySession(token);
  return { session, supabaseAdmin };
}
