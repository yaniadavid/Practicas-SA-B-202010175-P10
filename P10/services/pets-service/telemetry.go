package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

var requestCounter metric.Int64Counter
var requestDuration metric.Float64Histogram
var rolloutHash = getenv("ROLLOUT_HASH", "local")

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func initTelemetry(ctx context.Context) (func(context.Context), error) {
	res := resource.NewWithAttributes("", attribute.String("service.name", "pets-service"))
	traceExporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, err
	}
	metricExporter, err := otlpmetrichttp.New(ctx)
	if err != nil {
		return nil, err
	}
	traceProvider := sdktrace.NewTracerProvider(sdktrace.WithBatcher(traceExporter), sdktrace.WithResource(res))
	metricProvider := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExporter, sdkmetric.WithInterval(10*time.Second))),
		sdkmetric.WithResource(res),
		sdkmetric.WithView(sdkmetric.NewView(
			sdkmetric.Instrument{Name: "sa_http_request_duration_slo"},
			sdkmetric.Stream{Aggregation: sdkmetric.AggregationExplicitBucketHistogram{
				Boundaries: []float64{0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10},
			}},
		)),
	)
	otel.SetTracerProvider(traceProvider)
	otel.SetMeterProvider(metricProvider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	meter := otel.Meter("sa-platform-http")
	requestCounter, err = meter.Int64Counter("sa_http_requests")
	if err != nil {
		return nil, err
	}
	requestDuration, err = meter.Float64Histogram("sa_http_request_duration_slo", metric.WithUnit("s"))
	if err != nil {
		return nil, err
	}
	return func(shutdownCtx context.Context) {
		_ = metricProvider.Shutdown(shutdownCtx)
		_ = traceProvider.Shutdown(shutdownCtx)
	}, nil
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func jsonLog(ctx context.Context, level, message string, fields map[string]any) {
	spanContext := trace.SpanFromContext(ctx).SpanContext()
	entry := map[string]any{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level, "service": "pets-service", "message": message,
		"trace_id": "", "span_id": "",
	}
	if spanContext.IsValid() {
		entry["trace_id"] = spanContext.TraceID().String()
		entry["span_id"] = spanContext.SpanID().String()
	}
	for key, value := range fields {
		entry[key] = value
	}
	encoded, _ := json.Marshal(entry)
	_, _ = os.Stdout.Write(append(encoded, '\n'))
}

func observe(route string, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		parent := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))
		ctx, span := otel.Tracer("sa-platform-http").Start(parent, r.Method+" "+route, trace.WithSpanKind(trace.SpanKindServer))
		started := time.Now()
		writer := &statusWriter{ResponseWriter: w, status: 200}
		handler(writer, r.WithContext(ctx))
		statusClass := string(rune('0'+writer.status/100)) + "xx"
		attrs := metric.WithAttributes(
			attribute.String("service", "pets-service"),
			attribute.String("route", route),
			attribute.String("method", r.Method),
			attribute.String("status_class", statusClass),
			attribute.String("rollout_hash", rolloutHash),
		)
		requestCounter.Add(ctx, 1, attrs)
		requestDuration.Record(ctx, time.Since(started).Seconds(), attrs)
		span.SetAttributes(attribute.Int("http.response.status_code", writer.status))
		level := "info"
		if writer.status >= 500 {
			level = "error"
			span.SetStatus(codes.Error, "HTTP 5xx")
		}
		jsonLog(ctx, level, "http_request", map[string]any{"route": route, "status": writer.status})
		span.End()
	}
}
