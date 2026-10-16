import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collectorPort = 54318;
const gatewayPort = 54300;
const appointmentsPort = 54301;
const petsPort = 54302;
const token = "local-test-token";
const exported = [];
const logs = new Map();
const children = [];

const collector = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  exported.push({ path: req.url, body: Buffer.concat(chunks) });
  res.writeHead(200, { "content-type": "application/x-protobuf" });
  res.end();
});

function launch(name, command, args, cwd, extraEnv) {
  const child = spawn(command, args, {
    cwd, windowsHide: true,
    env: {
      ...process.env,
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collectorPort}`,
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
      ROLLOUT_HASH: "local-test",
      ...extraEnv
    }
  });
  children.push(child);
  logs.set(name, []);
  let pending = "";
  child.stdout.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) {
      try { logs.get(name).push(JSON.parse(line)); }
      catch { logs.get(name).push({ raw: line }); }
    }
  });
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  return child;
}

async function waitHealthy(url, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Service exited: ${url} (${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* startup in progress */ }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

try {
  collector.listen(collectorPort, "127.0.0.1");
  await once(collector, "listening");
  const petsBinary = process.platform === "win32" ? "pets-service.exe" : "pets-service";
  const pets = launch("pets", path.join(root, ".runtime", petsBinary), [], path.join(root, "services", "pets-service"), { PORT: String(petsPort) });
  await waitHealthy(`http://127.0.0.1:${petsPort}/health`, pets);
  const appointments = launch("appointments", "node", ["src/index.js"], path.join(root, "services", "appointments-service"), {
    PORT: String(appointmentsPort), APPOINTMENTS_STORAGE: "memory", APPOINTMENTS_WRITE_TOKEN: token,
    PETS_SERVICE_URL: `http://127.0.0.1:${petsPort}`
  });
  await waitHealthy(`http://127.0.0.1:${appointmentsPort}/health`, appointments);
  const gateway = launch("gateway", "node", ["src/index.js"], path.join(root, "services", "api-gateway"), {
    PORT: String(gatewayPort), APPOINTMENTS_SERVICE_URL: `http://127.0.0.1:${appointmentsPort}`
  });
  await waitHealthy(`http://127.0.0.1:${gatewayPort}/health`, gateway);

  const request = {
    petId: "pet-001", veterinarian: "Dra. Prueba", reason: "Prueba P10",
    scheduledAt: "2026-10-20T10:00:00Z"
  };
  const response = await fetch(`http://127.0.0.1:${gatewayPort}/api/appointments`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-appointments-write-token": token },
    body: JSON.stringify(request)
  });
  assert.equal(response.status, 201);
  const appointment = await response.json();
  assert.equal(appointment.petId, "pet-001");

  const invalid = await fetch(`http://127.0.0.1:${gatewayPort}/api/appointments`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-appointments-write-token": token },
    body: JSON.stringify({ ...request, petId: "pet-unknown" })
  });
  assert.equal(invalid.status, 422);

  await delay(12500);
  const byService = [
    logs.get("gateway").find((entry) => entry.route === "/api/appointments" && entry.status === 201),
    logs.get("appointments").find((entry) => entry.route === "/appointments" && entry.status === 201),
    logs.get("pets").find((entry) => entry.route === "/pets/:id" && entry.status === 200)
  ];
  assert.ok(byService.every(Boolean), "Missing structured request log in one of the three services");
  const traceIds = byService.map((entry) => entry.trace_id);
  assert.match(traceIds[0], /^[a-f0-9]{32}$/);
  assert.equal(new Set(traceIds).size, 1, "Trace context was not propagated to all services");
  const traceExports = exported.filter((item) => item.path === "/v1/traces" &&
    (item.body.includes(Buffer.from(traceIds[0], "hex")) || item.body.includes(traceIds[0])));
  for (const service of ["api-gateway", "appointments-service", "pets-service"]) {
    assert.ok(traceExports.some((item) => item.body.includes(service)), `Missing exported span from ${service}`);
  }
  assert.ok(exported.some((item) => item.path === "/v1/metrics" && item.body.includes("sa_appointments_created")), "Business metric was not exported");
  assert.ok(exported.some((item) => item.path === "/v1/metrics" && item.body.includes("sa_http_request_duration_slo")), "SLO latency histogram was not exported");
  console.log(JSON.stringify({ result: "PASS", trace_id: traceIds[0], services: ["api-gateway", "appointments-service", "pets-service"], otlp_exports: exported.length }));
} finally {
  for (const child of children) child.kill("SIGTERM");
  await Promise.all(children.map(async (child) => {
    if (child.exitCode === null) await Promise.race([once(child, "exit"), delay(3000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }));
  collector.close();
}
