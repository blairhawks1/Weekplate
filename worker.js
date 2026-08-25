import { DurableObject } from "cloudflare:workers";

const MAX_BODY_BYTES = 250_000;
const ROOM_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const CODE_RE = /^[A-F0-9]{20}$/;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("payload_too_large");
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("payload_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validSnapshot(value) {
  return value && typeof value === "object" &&
    (value.week === null || (typeof value.week === "object" && Array.isArray(value.week.recipes))) &&
    value.nightLimits && typeof value.nightLimits === "object" &&
    Array.isArray(value.cookNames);
}

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export class HouseholdRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS shared_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        revision INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        updated_by TEXT NOT NULL
      )`);
    });
  }

  row() {
    return this.ctx.storage.sql.exec(
      "SELECT revision, state_json, updated_at, updated_by FROM shared_state WHERE singleton = 1"
    ).toArray()[0] || null;
  }

  result(row) {
    if (!row) return null;
    return {
      revision: Number(row.revision),
      state: JSON.parse(String(row.state_json)),
      updatedAt: Number(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  async initialize(state, deviceId) {
    const existing = this.row();
    if (existing) return this.result(existing);
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO shared_state (singleton, revision, state_json, updated_at, updated_by) VALUES (1, 1, ?, ?, ?)",
      JSON.stringify(state), now, deviceId
    );
    await this.ctx.storage.setAlarm(now + ROOM_TTL_MS);
    return this.result(this.row());
  }

  async getState() {
    const row = this.row();
    if (!row) return null;
    return this.result(row);
  }

  async updateState(state, baseRevision, deviceId) {
    const current = this.row();
    if (!current) return { missing: true };
    if (Number(current.revision) !== Number(baseRevision)) {
      return { conflict: true, current: this.result(current) };
    }
    const revision = Number(current.revision) + 1;
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "UPDATE shared_state SET revision = ?, state_json = ?, updated_at = ?, updated_by = ? WHERE singleton = 1",
      revision, JSON.stringify(state), now, deviceId
    );
    await this.ctx.storage.setAlarm(now + ROOM_TTL_MS);
    return this.result(this.row());
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/sync/")) return env.ASSETS.fetch(request);
    try {
      if (request.method === "POST" && url.pathname === "/api/sync/create") {
        const body = await readJson(request);
        if (!validSnapshot(body.state) || typeof body.deviceId !== "string") return json({ error: "invalid_state" }, 400);
        const code = makeCode();
        const state = await env.HOUSEHOLDS.getByName(code).initialize(body.state, body.deviceId.slice(0, 80));
        return json({ code, ...state }, 201);
      }
      const code = url.pathname.slice("/api/sync/".length).replace(/-/g, "").toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: "invalid_code" }, 400);
      const room = env.HOUSEHOLDS.getByName(code);
      if (request.method === "GET") {
        const state = await room.getState();
        return state ? json(state) : json({ error: "not_found" }, 404);
      }
      if (request.method === "PUT") {
        const body = await readJson(request);
        if (!validSnapshot(body.state) || !Number.isInteger(body.baseRevision) || typeof body.deviceId !== "string") return json({ error: "invalid_state" }, 400);
        const result = await room.updateState(body.state, body.baseRevision, body.deviceId.slice(0, 80));
        if (result.missing) return json({ error: "not_found" }, 404);
        if (result.conflict) return json(result.current, 409);
        return json(result);
      }
      return json({ error: "method_not_allowed" }, 405);
    } catch (error) {
      if (error?.message === "payload_too_large") return json({ error: "payload_too_large" }, 413);
      if (error instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
      console.error(JSON.stringify({ event: "sync_error", message: String(error?.message || error) }));
      return json({ error: "server_error" }, 500);
    }
  },
};
