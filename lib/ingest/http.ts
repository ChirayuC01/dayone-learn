// Shared plumbing for the ingest API routes: bearer auth, rate limit, JSON + Zod parsing, error
// mapping and the IngestLog row. Route files stay one call each.
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { db } from "@/lib/db";
import { bearerMatches } from "@/lib/notify/unsubscribe";
import { hit, RULES } from "@/lib/ratelimit/limit";
import { IngestError } from "./normalize";
import { withIngestLog } from "./service";

export const MAX_BODY_BYTES = 1_000_000;

/** Flattens Zod issues into "path: message" strings. */
export function zodIssues(err: ZodError): string[] {
  return err.issues.map((i) => `${i.path.length ? i.path.join(".") : "body"}: ${i.message}`);
}

export async function authorizeIngest(req: Request): Promise<NextResponse | null> {
  if (!process.env.INGEST_TOKEN) return NextResponse.json({ ok: false, error: "INGEST_TOKEN is not configured" }, { status: 503 });
  if (!bearerMatches(req.headers.get("authorization"), process.env.INGEST_TOKEN)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const rl = await hit(db, "ingest", RULES.ingest);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  return null;
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new IngestError(413, `body is larger than ${MAX_BODY_BYTES} bytes`);
  try {
    return JSON.parse(text);
  } catch {
    throw new IngestError(400, "body is not valid JSON");
  }
}

/**
 * Runs one ingest operation: authorise, parse the body with `schema`, call `run`, log the outcome.
 * Every response is `{ ok, ... }`; failures carry `error` and `issues`.
 */
export async function ingestRoute<S extends z.ZodType, R extends { message: string; created?: boolean }>(
  req: Request,
  meta: { courseSlug: string; kind: "COURSE" | "LESSON" | "APPEND" | "MODULE"; day?: number },
  schema: S,
  run: (body: z.infer<S>) => Promise<R>,
): Promise<NextResponse> {
  const denied = await authorizeIngest(req);
  if (denied) return denied;
  try {
    const result = await withIngestLog(db, meta, async () => {
      const raw = await readJson(req);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new IngestError(400, "invalid body", zodIssues(parsed.error));
      return run(parsed.data);
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof IngestError) {
      return NextResponse.json({ ok: false, error: err.message, issues: err.issues }, { status: err.status });
    }
    if (err instanceof ZodError) return NextResponse.json({ ok: false, error: "invalid body", issues: zodIssues(err) }, { status: 400 });
    console.error("ingest failed", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

/** Parses a positive integer route segment, or throws a 400. */
export function intParam(raw: string, name: string): number {
  if (!/^\d{1,4}$/.test(raw) || Number(raw) < 1) throw new IngestError(400, `${name} must be a positive integer`);
  return Number(raw);
}

export const slugOk = (s: string) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);
