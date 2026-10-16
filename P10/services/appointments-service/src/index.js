import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { businessEvent, injectHeaders, log, observe } from "./telemetry.js";

const port = Number(process.env.PORT ?? 4300);
const storage = process.env.APPOINTMENTS_STORAGE ?? "memory";
const writeToken = process.env.APPOINTMENTS_WRITE_TOKEN ?? "";
if (!new Set(["memory", "postgres"]).has(storage)) {
  throw new Error(`Unsupported APPOINTMENTS_STORAGE: ${storage}`);
}

const pool = storage === "postgres" ? new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 5,
  connectionTimeoutMillis: 5000
}) : null;

pool?.on("error", (error) => log("error", "postgres_idle_error", { error: error.message }));

const appointments = [
  { id: "app-001", petId: "pet-001", veterinarian: "Dra. Sofia Lopez", reason: "Vacunacion anual", scheduledAt: "2026-08-25T10:00:00" },
  { id: "app-002", petId: "pet-002", veterinarian: "Dr. Marco Diaz", reason: "Revision general", scheduledAt: "2026-08-26T15:30:00" }
];

const appointmentColumns = `id, pet_id AS "petId", veterinarian, reason,
  scheduled_at AS "scheduledAt", created_at AS "createdAt"`;

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new Error("request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validAppointment(body) {
  return body && typeof body === "object" &&
    [["petId", 100], ["veterinarian", 200], ["reason", 500]].every(([key, max]) =>
      typeof body[key] === "string" && body[key].trim().length > 0 && body[key].length <= max) &&
    typeof body.scheduledAt === "string" && !Number.isNaN(Date.parse(body.scheduledAt));
}

function canWrite(req) {
  const supplied = req.headers["x-appointments-write-token"];
  if (!writeToken || typeof supplied !== "string") return false;
  const expectedBytes = Buffer.from(writeToken);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes);
}

async function listAppointments() {
  if (!pool) return appointments;
  const result = await pool.query(`SELECT ${appointmentColumns} FROM sa_appointments ORDER BY created_at, id`);
  return result.rows;
}

async function createAppointment(body) {
  const item = {
    id: randomUUID(),
    petId: body.petId.trim(),
    veterinarian: body.veterinarian.trim(),
    reason: body.reason.trim(),
    scheduledAt: new Date(body.scheduledAt).toISOString()
  };
  if (!pool) {
    appointments.push(item);
    return item;
  }
  const result = await pool.query(
    `INSERT INTO sa_appointments (id, pet_id, veterinarian, reason, scheduled_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${appointmentColumns}`,
    [item.id, item.petId, item.veterinarian, item.reason, item.scheduledAt]
  );
  return result.rows[0];
}

async function petExists(petId) {
  const baseUrl = process.env.PETS_SERVICE_URL || "http://pets-service:4200";
  const response = await fetch(`${baseUrl}/pets/${encodeURIComponent(petId)}`, {
    headers: injectHeaders({}),
    signal: AbortSignal.timeout(3000)
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`PETS_HTTP_${response.status}`);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const route = url.pathname.startsWith("/appointments/") ? "/appointments/:id" : url.pathname;
  await observe(req, res, route, async () => {
  try {
    if (url.pathname === "/live") {
      return sendJson(res, 200, { status: "ok" });
    }
    if (url.pathname === "/health") {
      if (pool) await pool.query("SELECT 1");
      return sendJson(res, 200, { status: "ok", service: "appointments-service", storage });
    }
    if (url.pathname === "/appointments" && req.method === "GET") {
      return sendJson(res, 200, await listAppointments());
    }
    if (url.pathname === "/appointments" && req.method === "POST") {
      if (!canWrite(req)) {
        businessEvent("rejected", "unauthorized");
        return sendJson(res, 403, { message: "appointment write token required" });
      }
      let body;
      try {
        body = await readJson(req);
      } catch {
        businessEvent("rejected", "invalid_json");
        return sendJson(res, 400, { message: "invalid JSON or request body too large" });
      }
      if (!validAppointment(body)) {
        businessEvent("rejected", "invalid_input");
        return sendJson(res, 400, { message: "petId, veterinarian, reason and scheduledAt are required" });
      }
      if (!(await petExists(body.petId))) {
        businessEvent("rejected", "pet_not_found");
        return sendJson(res, 422, { message: "petId does not exist" });
      }
      const appointment = await createAppointment(body);
      businessEvent("created");
      return sendJson(res, 201, appointment);
    }
    if (url.pathname === "/graphql" && req.method === "POST") {
      let body;
      try {
        body = await readJson(req);
      } catch {
        return sendJson(res, 400, { message: "invalid JSON or request body too large" });
      }
      if (!String(body.query ?? "").toLowerCase().includes("appointments")) {
        return sendJson(res, 400, { errors: [{ message: "Only the appointments query is available" }] });
      }
      return sendJson(res, 200, { data: { appointments: await listAppointments() } });
    }
    return sendJson(res, 404, { message: "Route not found" });
  } catch (error) {
    log("error", "appointment_request_failed", { error: error instanceof Error ? error.message : "unknown" });
    return sendJson(res, 503, { message: "Appointment storage unavailable" });
  }
  });
});

async function start() {
  if (pool) {
    if (!process.env.POSTGRES_HOST || !process.env.POSTGRES_DB ||
        !process.env.POSTGRES_USER || !process.env.POSTGRES_PASSWORD) {
      throw new Error("PostgreSQL connection settings are incomplete");
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS sa_appointments (
      id text PRIMARY KEY,
      pet_id text NOT NULL,
      veterinarian text NOT NULL,
      reason text NOT NULL,
      scheduled_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  }
  server.listen(port, () => log("info", "listening", { port, storage }));
}

start().catch((error) => {
  log("error", "startup_failed", { error: error.message });
  process.exitCode = 1;
  pool?.end();
});
