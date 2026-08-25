import { DurableObject } from "cloudflare:workers";

const MAX_BODY_BYTES = 12_000_000;
const CHUNK_CHARACTERS = 350_000;
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
  if (value?.schema === 2) return value.account && typeof value.account === "object" && !Array.isArray(value.account) && !Object.prototype.hasOwnProperty.call(value.account, "sync");
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
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS room_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        revision INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        updated_by TEXT NOT NULL
      )`);
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS state_chunks (
        chunk_index INTEGER PRIMARY KEY,
        data TEXT NOT NULL
      )`);
      const meta = this.metaRow();
      const legacy = this.ctx.storage.sql.exec("SELECT revision, state_json, updated_at, updated_by FROM shared_state WHERE singleton = 1").toArray()[0];
      if (!meta && legacy) this.writeState(String(legacy.state_json), Number(legacy.revision), Number(legacy.updated_at), String(legacy.updated_by));
    });
  }

  metaRow() {
    return this.ctx.storage.sql.exec(
      "SELECT revision, chunk_count, updated_at, updated_by FROM room_meta WHERE singleton = 1"
    ).toArray()[0] || null;
  }

  result(row) {
    if (!row) return null;
    const chunks = this.ctx.storage.sql.exec("SELECT data FROM state_chunks ORDER BY chunk_index").toArray();
    if (chunks.length !== Number(row.chunk_count)) throw new Error("incomplete_state");
    return {
      revision: Number(row.revision),
      state: JSON.parse(chunks.map(chunk => String(chunk.data)).join("")),
      updatedAt: Number(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  writeState(serialized, revision, updatedAt, updatedBy) {
    const chunks = [];
    for (let offset = 0; offset < serialized.length; offset += CHUNK_CHARACTERS) chunks.push(serialized.slice(offset, offset + CHUNK_CHARACTERS));
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM state_chunks");
      chunks.forEach((data, index) => this.ctx.storage.sql.exec("INSERT INTO state_chunks (chunk_index, data) VALUES (?, ?)", index, data));
      this.ctx.storage.sql.exec(
        `INSERT INTO room_meta (singleton, revision, chunk_count, updated_at, updated_by) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision, chunk_count=excluded.chunk_count, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
        revision, chunks.length, updatedAt, updatedBy
      );
    });
  }

  async initialize(state, deviceId) {
    const existing = this.metaRow();
    if (existing) return this.result(existing);
    const now = Date.now();
    this.writeState(JSON.stringify(state), 1, now, deviceId);
    await this.ctx.storage.setAlarm(now + ROOM_TTL_MS);
    return this.result(this.metaRow());
  }

  async getState() {
    const row = this.metaRow();
    if (!row) return null;
    return this.result(row);
  }

  async updateState(state, baseRevision, deviceId) {
    const current = this.metaRow();
    if (!current) return { missing: true };
    if (Number(current.revision) !== Number(baseRevision)) {
      return { conflict: true, current: this.result(current) };
    }
    const revision = Number(current.revision) + 1;
    const now = Date.now();
    this.writeState(JSON.stringify(state), revision, now, deviceId);
    await this.ctx.storage.setAlarm(now + ROOM_TTL_MS);
    return this.result(this.metaRow());
  }

  async alarm() {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM state_chunks");
      this.ctx.storage.sql.exec("DELETE FROM room_meta");
      this.ctx.storage.sql.exec("DELETE FROM shared_state");
    });
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
