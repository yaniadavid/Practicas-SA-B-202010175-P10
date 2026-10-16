# Flujo de telemetría de P10

```mermaid
flowchart LR
  subgraph APP[Namespace sa-p8]
    G[api-gateway] -->|POST /appointments| A[appointments-service]
    A -->|GET /pets/:id| P[pets-service]
  end

  G & A & P -->|métricas y trazas OTLP/HTTP| C[OpenTelemetry Collector]
  G & A & P -->|registros JSON con trace_id| L[Collector de logs]
  C -->|métricas| PR[Prometheus]
  C -->|trazas| T[Tempo]
  L -->|registros| LO[Loki]
  PR -->|SLI, presupuesto y burn rate| R[PrometheusRule]
  R -->|alertas| AM[Alertmanager]
  AM -->|notificación| SNS[AWS SNS y correo confirmado]
  PR & T & LO --> GR[Grafana]
  RO[Argo Rollouts AnalysisTemplate] -->|consulta 5xx y p95 por rollout_hash| PR
  RO -->|promueve o revierte| APP
  GO[Repositorio GitOps] --> CD[Argo CD]
  CD -->|declara plataforma y stack| APP
  CD --> C & L & PR & T & LO & AM & GR & RO
```

Una solicitud de cita propaga `traceparent` del gateway a citas y mascotas. El Collector envía las trazas a Tempo y las métricas a Prometheus. Los registros JSON de los pods van a Loki con el mismo `trace_id`, por lo que el operador puede pasar de una alerta en Grafana a la traza y luego al registro causal. `rollout_hash` separa las métricas de la candidata para que Argo Rollouts decida la promoción.

La aplicación del stack y del AnalysisTemplate procede de [GitOps](https://github.com/yaniadavid/Practicas-SA-B-202010175-P8); el diagrama representa el flujo operativo comprobado en las etapas 3 a 5.
