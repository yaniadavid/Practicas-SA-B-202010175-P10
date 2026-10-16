"""Export the GitOps Grafana dashboard JSON for the P10 appointment SLOs."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "gitops/apps/observability/dashboard/p10-operations.json"
PROMETHEUS = {"type": "prometheus", "uid": "prometheus"}
POST = 'job="api-gateway",route="/api/appointments",method="POST"'
HISTOGRAM = "sa_http_request_duration_slo_seconds_bucket"


def panel(identifier, title, description, expression, x, y, w=12, h=8,
          kind="timeseries", unit="short", minimum=None, thresholds=None,
          legend=None):
    field = {"defaults": {"unit": unit, "color": {"mode": "palette-classic"}},
             "overrides": []}
    if minimum is not None:
        field["defaults"]["min"] = minimum
    if thresholds is not None:
        field["defaults"]["thresholds"] = {"mode": "absolute", "steps": thresholds}
        field["defaults"]["color"] = {"mode": "thresholds"}
    result = {
        "id": identifier, "title": title, "description": description, "type": kind,
        "gridPos": {"x": x, "y": y, "w": w, "h": h}, "datasource": PROMETHEUS,
        "fieldConfig": field,
        "targets": [{"datasource": PROMETHEUS, "expr": expression,
                     "refId": "A", "legendFormat": legend or title}],
        "options": {"legend": {"displayMode": "list", "placement": "bottom"},
                    "tooltip": {"mode": "single"}}
    }
    if kind == "stat":
        result["options"] = {"reduceOptions": {"calcs": ["lastNotNull"],
                                               "fields": "", "values": False},
                             "orientation": "auto", "colorMode": "value",
                             "graphMode": "area", "justifyMode": "auto"}
    return result


panels = [
    panel(1, "Disponibilidad 7d", "¿Cumple el POST de citas el objetivo de 99.99%? Se excluyen los 4xx.",
          "p10:availability:sli7d", 0, 0, 6, 5, "stat", "percentunit", 0,
          [{"color": "red", "value": None}, {"color": "green", "value": 0.9999}]),
    panel(2, "Latencia ≤ 1s · 7d", "¿Cumple el POST exitoso de citas el objetivo de 99.99%?",
          "p10:latency:sli7d", 6, 0, 6, 5, "stat", "percentunit", 0,
          [{"color": "red", "value": None}, {"color": "green", "value": 0.9999}]),
    panel(3, "Presupuesto disp. 7d", "1 = 100% del presupuesto de errores de 7 días.",
          "p10:availability:budget_used7d", 12, 0, 6, 5, "stat", "percentunit", 0,
          [{"color": "green", "value": None}, {"color": "orange", "value": 0.25},
           {"color": "red", "value": 1}]),
    panel(4, "Presupuesto latencia 7d", "1 = 100% del presupuesto de latencia de 7 días.",
          "p10:latency:budget_used7d", 18, 0, 6, 5, "stat", "percentunit", 0,
          [{"color": "green", "value": None}, {"color": "orange", "value": 0.25},
           {"color": "red", "value": 1}]),
    panel(5, "Latencia p95 · POST exitoso", "¿Se acerca la cola de latencia al límite de 1 segundo?",
          f'histogram_quantile(0.95, sum by (le) (rate({HISTOGRAM}{{{POST},status_class="2xx"}}[5m])))',
          0, 5, unit="s", minimum=0),
    panel(6, "Latencia p50 · POST exitoso", "¿Cambió el tiempo típico de respuesta?",
          f'histogram_quantile(0.50, sum by (le) (rate({HISTOGRAM}{{{POST},status_class="2xx"}}[5m])))',
          12, 5, unit="s", minimum=0),
    panel(7, "Tráfico · POST de citas", "¿Cuántas solicitudes por segundo llegan al flujo medido?",
          f'sum(rate(sa_http_requests_total{{{POST}}}[5m]))',
          0, 13, unit="reqps", minimum=0),
    panel(8, "Errores 5xx · POST de citas", "¿Los fallos del servicio explican el consumo del presupuesto?",
          f'sum(rate(sa_http_requests_total{{{POST},status_class="5xx"}}[5m])) or vector(0)',
          12, 13, unit="reqps", minimum=0),
    panel(9, "Saturación · CPU", "¿Algún servicio alcanza su límite de CPU? Fracción de CPU usada respecto al límite.",
          'sum by (container) (rate(container_cpu_usage_seconds_total{namespace="sa-p8",container=~"api-gateway|appointments-service|pets-service"}[5m])) / on (container) group_left() '
          'sum by (container) (kube_pod_container_resource_limits{namespace="sa-p8",container=~"api-gateway|appointments-service|pets-service",resource="cpu"})',
          0, 21, unit="percentunit", minimum=0, legend="{{container}}"),
    panel(10, "Saturación · memoria", "¿Se aproxima algún servicio a su límite de memoria?",
          'sum by (container) (container_memory_working_set_bytes{namespace="sa-p8",container=~"api-gateway|appointments-service|pets-service"}) / on (container) group_left() '
          'sum by (container) (kube_pod_container_resource_limits{namespace="sa-p8",container=~"api-gateway|appointments-service|pets-service",resource="memory"})',
          12, 21, unit="percentunit", minimum=0, legend="{{container}}"),
    panel(11, "Ritmo de consumo · disponibilidad", "¿Se acelera el consumo del presupuesto? 14.4x activa la alerta al sostenerse en 5m y 1h.",
          "p10:availability:burn5m", 0, 29, unit="short", minimum=0),
    panel(12, "Ritmo de consumo · latencia", "¿Se acelera el consumo del presupuesto de latencia?",
          "p10:latency:burn5m", 12, 29, unit="short", minimum=0),
]

dashboard = {
    "annotations": {"list": []}, "description": "P10: dos SLO al 99.99% y cuatro señales de oro para POST /api/appointments.",
    "editable": False, "fiscalYearStartMonth": 0, "graphTooltip": 1, "id": None,
    "links": [], "panels": panels, "refresh": "30s", "schemaVersion": 41,
    "tags": ["P10", "SLO", "appointments", "golden-signals"],
    "templating": {"list": []}, "time": {"from": "now-1h", "to": "now"},
    "timepicker": {}, "timezone": "browser", "title": "P10 · Citas · SLO y señales de oro",
    "uid": "p10-appointments-slo", "version": 1,
}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(OUTPUT)
