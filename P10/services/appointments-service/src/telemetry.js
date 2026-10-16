import { context, metrics, propagation, trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { AggregationType, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";

const service = process.env.OTEL_SERVICE_NAME || "appointments-service";
const endpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318").replace(/\/$/, "");
const rolloutHash = process.env.ROLLOUT_HASH || "local";
const sdk = new NodeSDK({
  resource: resourceFromAttributes({ "service.name": service }),
  traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
    exportIntervalMillis: 10000
  }),
  views: [{
    instrumentName: "sa_http_request_duration_slo",
    aggregation: {
      type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
      options: { boundaries: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10] }
    }
  }]
});
sdk.start();

const tracer = trace.getTracer("sa-platform-http");
const meter = metrics.getMeter("sa-platform-http");
const requests = meter.createCounter("sa_http_requests", { description: "Solicitudes HTTP completadas" });
const duration = meter.createHistogram("sa_http_request_duration_slo", { unit: "s", description: "Duracion HTTP para SLO" });
const created = meter.createCounter("sa_appointments_created", { description: "Citas creadas correctamente" });
const rejected = meter.createCounter("sa_appointments_rejected", { description: "Intentos de crear citas rechazados" });

export function businessEvent(name, reason = "none") {
  const attrs = { service, reason, rollout_hash: rolloutHash };
  if (name === "created") created.add(1, attrs);
  if (name === "rejected") rejected.add(1, attrs);
}

export function log(level, message, fields = {}) {
  const span = trace.getSpan(context.active());
  const spanContext = span?.spanContext();
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level, service, message,
    trace_id: spanContext?.traceId || null,
    span_id: spanContext?.spanId || null,
    ...fields
  }));
}

export function injectHeaders(headers) {
  propagation.inject(context.active(), headers);
  return headers;
}

export function observe(req, res, route, handler) {
  const parent = propagation.extract(context.active(), req.headers);
  return context.with(parent, () => tracer.startActiveSpan(`${req.method} ${route}`, { kind: SpanKind.SERVER }, async (span) => {
    const started = performance.now();
    try {
      await handler();
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      const attrs = {
        service, route, method: req.method,
        status_class: `${Math.floor(res.statusCode / 100)}xx`,
        rollout_hash: rolloutHash
      };
      requests.add(1, attrs);
      duration.record((performance.now() - started) / 1000, attrs);
      span.setAttribute("http.response.status_code", res.statusCode);
      if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      log(res.statusCode >= 500 ? "error" : "info", "http_request", { route, status: res.statusCode });
      span.end();
    }
  }));
}

process.once("SIGTERM", () => { void sdk.shutdown().finally(() => process.exit(0)); });
