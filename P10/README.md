# Práctica 10: observabilidad y operación del canary

**Carné:** 202010175 · **Sección:** B · **Entorno:** EKS `sa-p9-202010175`, namespace de servicios `sa-p8` y namespace de observabilidad `observability`.

Este repositorio reúne la instrumentación de tres microservicios, los manifiestos de observabilidad aplicados por GitOps, dos SLO de 99.99%, el tablero operativo y la evidencia de una reversión automática causada por métricas reales. La plataforma quedó `Synced/Healthy` después del ensayo. El video será grabado y publicado por la estudiante; el [guion de 7 minutos](docs/guion-video.md) está listo.

## Tabla de enlaces de entrega

| Ítem | Enlace o dato requerido |
| --- | --- |
| Repositorio de código | [P10 público](https://github.com/yaniadavid/Practicas-SA-B-202010175-P10) |
| Repositorio GitOps | [Practicas-SA-B-202010175-P8](https://github.com/yaniadavid/Practicas-SA-B-202010175-P8) |
| Servicios instrumentados | `api-gateway`, `appointments-service` y `pets-service`, namespace `sa-p8`; [código](services/) |
| AnalysisTemplate por métricas | `p10-prometheus-canary`; [manifiesto GitOps](https://github.com/yaniadavid/Practicas-SA-B-202010175-P8/blob/main/charts/sa-platform/templates/p10-canary-analysis.yaml) y [copia P10](gitops/platform/templates/p10-canary-analysis.yaml) |
| Consultas del análisis | [PromQL de 5xx y p95](docs/consultas-canary.md), con el hash candidato y mínimo de 10 muestras |
| SLO declarados | Disponibilidad **99.99% / 7 días** para POST `/api/appointments` elegibles 2xx, 3xx y 5xx; latencia **99.99% / 7 días** de POST 2xx completados en **≤ 1 s**. [Definiciones y justificación](docs/etapa4.md) |
| Reglas de alerta | [PrometheusRule](gitops/apps/observability/slo-rules/slo-rules.yaml): `P10AvailabilityBudgetBurn` y `P10LatencyBudgetBurn`; [runbooks](runbooks/) |
| Tablero | [JSON exportado](gitops/apps/observability/dashboard/p10-operations.json) y [captura en operación](evidence/etapa4/dashboard.png) |
| Reversión por métricas | Rollout `pets-service`, AnalysisRun fallido `pets-service-679cb87476-4-2`; [AnalysisRun](evidence/etapa5/analysis-run-latency-failed.json) y [Rollout abortado](evidence/etapa5/rollout-aborted.json) |
| Recorrido síntoma a causa | [Alerta → traza → log](evidence/etapa5/alert-to-cause.json): **0.5 s** desde la detección de la alerta; `trace_id=c6cf9eaa0c618faa99e4ed7197567e8c` |
| Video demostrativo | **URL pendiente de publicación por la estudiante**; [guion y minutaje 0:00-7:00](docs/guion-video.md). Esta fila debe recibir la URL pública tras la grabación. |

## Qué se demostró

- El recorrido `api-gateway → appointments-service → pets-service` conserva un `trace_id` en spans de Tempo y registros JSON de Loki. [Verificación](evidence/etapa3/verification.json).
- El tablero de Grafana presenta latencia, tráfico, errores, saturación, SLO y métricas de negocio. [Verificación](evidence/etapa4/verification.json).
- La candidata lenta de mascotas tuvo 0% de 5xx y p95 de 4.85 s. Prometheus entregó esos valores al AnalysisTemplate y Argo Rollouts abortó la revisión sin intervención manual. El primer intento se abortó por falta de muestras y está [documentado por separado](evidence/etapa5/analysis-run-no-samples.json), sin atribuirlo a latencia.
- `P10LatencyBudgetBurn` se activó por consumo del presupuesto; el operador llegó al log `pet_lookup_injected_delay` desde la traza en 0.5 s. Después de retirar el fallo, Argo CD y el Rollout quedaron saludables y la alerta inactiva. [Estado final](evidence/etapa5/verification.json).

## Arquitectura, operación y evidencia

El [diagrama del flujo de telemetría](docs/flujo-telemetria.md) muestra Collector, Prometheus, Tempo, Loki, Grafana, Alertmanager/SNS y el análisis de Argo Rollouts. Los manifiestos activos están en el [repositorio GitOps](https://github.com/yaniadavid/Practicas-SA-B-202010175-P8); `gitops/` conserva una copia de entrega. El [informe de operación](docs/informe-operacion.pdf) responde los seis campos solicitados en dos páginas. Las bitácoras [etapa 1](docs/etapa1.md), [etapa 2](docs/etapa2.md), [etapa 3](docs/etapa3.md), [etapa 4](docs/etapa4.md) y [etapa 5](docs/etapa5.md) registran la implementación y sus límites.

El archivo [`.github/workflows/p10-observability.yml`](../.github/workflows/p10-observability.yml) contiene las pruebas, construcción de imágenes, análisis con Trivy, SBOM CycloneDX, firma Cosign y PR de promoción GitOps. El [resumen público de las tres ejecuciones](evidence/ci-verification.json) conserva sus estados y trabajos; las ejecuciones originales ocurrieron en el repositorio de trabajo privado. Para ejecutar manualmente la promoción desde esta copia pública se necesita configurar `SA_TOKEN` con acceso al repositorio GitOps.

Los SLO de 7 días comenzaron a acumular datos al desplegarse la instrumentación. Las muestras de laboratorio y el ensayo de fallo prueban la mecánica del SLI, la alerta y el rollback; no acreditan siete días continuos de cumplimiento de 99.99%.
