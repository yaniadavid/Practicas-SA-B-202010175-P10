import http from "node:http";
import { injectHeaders, log, observe } from "./telemetry.js";

const port = Number(process.env.PORT ?? 3000);

const services = {
  auth: process.env.AUTH_SERVICE_URL ?? "http://auth-service:4000",
  authorization: process.env.AUTHORIZATION_SERVICE_URL ?? "http://authorization-service:5000",
  owners: process.env.OWNERS_SERVICE_URL ?? "http://owners-service:4100",
  pets: process.env.PETS_SERVICE_URL ?? "http://pets-service:4200",
  appointments: process.env.APPOINTMENTS_SERVICE_URL ?? "http://appointments-service:4300",
  medicalRecords: process.env.MEDICAL_RECORDS_SERVICE_URL ?? "http://medical-records-service:4400"
};

const routes = [
  { prefix: "/api/auth", target: services.auth, rewrite: "/auth" },
  { prefix: "/api/protected", target: services.auth, rewrite: "/protected" },
  { prefix: "/api/authorization", target: services.authorization, rewrite: "" },
  { prefix: "/api/owners", target: services.owners, rewrite: "/owners" },
  { prefix: "/api/pets", target: services.pets, rewrite: "/pets" },
  { prefix: "/api/pets-graphql", target: services.pets, rewrite: "/graphql" },
  { prefix: "/api/appointments", target: services.appointments, rewrite: "/appointments" },
  { prefix: "/api/appointments-graphql", target: services.appointments, rewrite: "/graphql" },
  { prefix: "/api/medical-records", target: services.medicalRecords, rewrite: "/medical-records" }
];

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function matchRoute(pathname) {
  return routes.find((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`));
}

async function proxy(req, res, route, pathname, search) {
  const suffix = pathname.slice(route.prefix.length);
  const targetUrl = `${route.target}${route.rewrite}${suffix}${search}`;
  const body = await readBody(req);
  const headers = { ...req.headers };
  delete headers.host;
  injectHeaders(headers);

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: body.length > 0 ? body : undefined,
    redirect: "manual"
  });

  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const route = matchRoute(url.pathname);
  await observe(req, res, route?.prefix || url.pathname, async () => {
    try {

    if (url.pathname === "/health") {
      return sendJson(res, 200, { status: "ok", service: "api-gateway", services });
    }

    if (!route) {
      return sendJson(res, 404, {
        message: "Route not found",
        availablePrefixes: routes.map((item) => item.prefix)
      });
    }

    return await proxy(req, res, route, url.pathname, url.search);
  } catch (error) {
    log("error", "gateway_upstream_failure", { error: error instanceof Error ? error.message : "unknown" });
    return sendJson(res, 502, {
      message: "Gateway error",
      error: error instanceof Error ? error.message : "unknown error"
    });
  }
  });
});

server.listen(port, () => {
  log("info", "listening", { port });
});
