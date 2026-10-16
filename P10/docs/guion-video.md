# Guion del video demostrativo (7 minutos)

La estudiante grabará y publicará el video. Este guion usa la evidencia archivada de las etapas 3 a 5, por lo que no exige volver a inducir una falla en el clúster. Antes de grabar, abrir las rutas indicadas y ampliar el texto de terminal o navegador para que los valores sean legibles.

| Minutaje | Mostrar | Narración sugerida |
| --- | --- | --- |
| 0:00-0:35 | `P10/README.md` y [diagrama](flujo-telemetria.md). | "P10 agrega observabilidad al flujo de creación de citas: gateway, citas y mascotas. La señal sale de los servicios hacia Prometheus, Tempo y Loki; Grafana y Alertmanager la convierten en decisiones de operación." |
| 0:35-1:25 | Código de propagación en `services/api-gateway/src/index.js`, `services/appointments-service/src/index.js` y `evidence/etapa3/verification.json`. | "Los tres servicios usan OpenTelemetry. Una petición POST conserva el mismo identificador de traza mientras consulta la mascota y guarda la cita. Los logs JSON también incluyen ese identificador." |
| 1:25-2:10 | Dashboard `evidence/etapa4/dashboard.png` y JSON `gitops/apps/observability/dashboard/p10-operations.json`. | "El tablero reúne latencia, tráfico, errores y saturación. También muestra dos métricas de negocio: citas creadas y solicitudes rechazadas." |
| 2:10-2:55 | `docs/etapa4.md`, `gitops/apps/observability/slo-rules/slo-rules.yaml` y runbooks. | "Los SLO de disponibilidad y latencia son 99.99% en siete días. Una cita exitosa debe tardar como máximo un segundo. Las alertas miden consumo del presupuesto en cinco minutos y una hora, con runbooks de atención." |
| 2:55-3:50 | `gitops/platform/templates/p10-canary-analysis.yaml` y [consultas](consultas-canary.md). | "El canary ya consulta Prometheus. Para el hash candidato exige diez muestras, máximo 1% de 5xx y p95 máximo de un segundo; si faltan muestras, no promueve." |
| 3:50-4:50 | `evidence/etapa5/analysis-run-latency-failed.json` y `rollout-aborted.json`; resaltar `Failed`, `[4.85]`, `[0]`, `stableRS`. | "Activé una demora de dos segundos solo en la candidata de mascotas. El AnalysisRun midió cero 5xx y p95 de 4.85 segundos. Argo Rollouts abortó automáticamente la revisión y mantuvo dos réplicas estables." |
| 4:50-5:50 | `evidence/etapa5/alertmanager-firing.json` y `alert-to-cause.json`; resaltar `trace_id`, tres servicios y `pet_lookup_injected_delay`. | "Una cita completa tardó 2269.8 milisegundos. La alerta de consumo de presupuesto se activó a las 17:12:11 UTC. Con el trace_id llegué desde la alerta a la traza de los tres servicios y al log causal de mascotas." |
| 5:50-6:30 | En `alert-to-cause.json`, `alert_to_cause_seconds: 0.5`; luego `evidence/etapa5/verification.json`. | "El recorrido desde la detección de la alerta hasta la causa tomó 0.5 segundos. Tras la reversión, Argo CD volvió a Synced y Healthy, el Rollout quedó Healthy y la alerta se resolvió." |
| 6:30-7:00 | [Informe](informe-operacion.pdf) y tabla de enlaces del README. | "El informe deja los tiempos medidos y la mejora pendiente. El repositorio público reúne código, GitOps, tablero, runbooks y evidencia para revisar cada resultado." |

## Preparación de la grabación

- Sustituir la fila de video del README por la URL pública una vez subido; conservar este minutaje en la descripción o en el README.
- Si se usa Grafana en vivo, verificar que el clúster siga activo. La captura y los JSON conservan la demostración aunque el entorno se apague después.
- No mostrar tokens, valores de Secrets Manager ni el contenido de secretos de Kubernetes.
