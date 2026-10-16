# P10 - Etapa 5: canary gobernado por métricas y diagnóstico de incidente

Estado: terminada y verificada en EKS. La etapa 6 requiere el visto bueno del estudiante.

## Promoción y reversión

Los Rollouts de `api-gateway`, `appointments-service` y `pets-service` usan el `AnalysisTemplate` `p10-prometheus-canary` en lugar del Job que solo consultaba `/health`. Los pasos avanzan por 20%, 50% y 100% con análisis en cada punto. El análisis consulta Prometheus para la **versión candidata**, identificada por `rollout_hash`, y la ruta real de cada servicio. Mide el porcentaje de 5xx y el p95 de respuestas exitosas en ventanas de 2 minutos. Requiere al menos 10 solicitudes elegibles; una medición ausente o insuficiente devuelve `-1` y detiene la promoción. La versión candidata falla si supera **1% de 5xx** o **1 segundo de p95**. En esta prueba, el primer escalón esperó 240 segundos para permitir tráfico y exportación de métricas.

La compilación `v1.0.3` añadió a mascotas el modo de fallo controlado `P10_FAULT_MODE=slow`: demora 2 segundos al consultar una mascota, registra `pet_lookup_injected_delay` con `trace_id` y anota el span `p10.fault_mode=slow`. El modo se activó solo para el candidato mediante el PR GitOps #8; gateway y citas permanecieron en `v1.0.2`. Es un fallo de latencia distinto de la prueba de disponibilidad de P8. El workflow de `v1.0.3` pasó validación, Trivy, SBOM y firma.

Hubo dos intentos, conservados para distinguir sus causas:

| Intento | Momento UTC | Resultado medido | Acción de Argo |
| --- | --- | --- | --- |
| 1 | 17:07:03 | Ambas métricas `[-1]`: menos de 10 solicitudes a la candidata. La evidencia sugiere que las conexiones persistentes de citas siguieron usando réplicas estables. | Reversión automática por falta de evidencia; no se interpreta como una degradación medida. |
| 2 | 17:12:50 | 5xx `0`; p95 `4.85 s` (estimación del histograma, frente a ~2.2 s observados por solicitud). | `AnalysisRun Failed` por `canary-p95-latency-seconds`; Rollout abortado automáticamente y hash estable `5bb9988c9b` conservado con 2 réplicas disponibles. |

Para el segundo intento se generó tráfico concurrente a través de `POST /api/appointments` y carga directa al pod candidato `GET /pets/pet-001`. La carga directa aseguró suficientes muestras del hash candidato; el POST completo acreditó el impacto en usuario y produjo una traza de los tres servicios. Prometheus registró 16 solicitudes candidatas elegibles en 2 minutos, 0% de 5xx y p95 de 4.85 segundos antes del análisis. Los datos proceden de `P10/evidence/etapa5/prometheus-during-canary.json` y de ambos AnalysisRun. Los errores de conexión registrados al principio de los archivos de carga corresponden al uso inicial de `127.0.0.1` con un `port-forward` que aceptaba `localhost`; se corrigió antes de la prueba válida y se conservaron para trazabilidad.

Después del aborto automático se retiraron `faultMode` y el identificador del ensayo en GitOps y se restauró la imagen estable `v1.0.2`. Argo CD quedó `Synced/Healthy`; el Rollout de mascotas quedó `Healthy`, con el hash estable y 2 réplicas. Tres POST de recuperación devolvieron `201` en 214–360 ms. La alerta volvió a `inactive` a las 17:15:11 UTC, al salir la solicitud lenta de la ventana de 5 minutos. La retirada del fallo fue una limpieza posterior al aborto, no la acción que produjo la reversión.

## Alerta, traza y log

Una cita del recorrido completo respondió `201` en 2269.8 ms a las 17:09:30 UTC. Su traza `c6cf9eaa0c618faa99e4ed7197567e8c` contiene `api-gateway`, `appointments-service` y `pets-service`; el span de mascotas muestra el modo `slow` y una demora de 2000.4 ms. Loki contiene `pet_lookup_injected_delay`, `delay_ms=2000` y el mismo `trace_id`.

El ritmo de consumo del presupuesto de latencia llegó a **32.57× en 5 minutos** y **25.38× en 1 hora**, por encima del umbral 14.4×. La alerta `P10LatencyBudgetBurn` entró en estado activo a las **17:12:11 UTC** y se enrutó a `p10-slo-email`. El observador la detectó a las 17:12:14.594 UTC y confirmó traza y log a las 17:12:15.142 UTC: **0.5 segundos desde la detección de la alerta**, menos de 3 minutos. Este tiempo mide la investigación desde que Alertmanager declaró el incidente; la regla acumula 2 minutos antes de disparar. Alertmanager registró una notificación SNS adicional respecto de la prueba de la etapa 4 y 0 fallos de integración. La recepción en la bandeja de correo no se inspeccionó.

La secuencia verificable está en `P10/evidence/etapa5/alertmanager-firing.json`, `alert-to-cause.json` y los archivos de carga. Al cerrar la etapa, el observador del primer intento sobrescribió el archivo del segundo con un resultado inconcluso porque buscaba en la carga equivocada. Se conservó ese resultado como `alert-to-cause-first-observer.json`, se restauraron las marcas de tiempo de la salida confirmada del segundo observador y se consultaron nuevamente Tempo y Loki; `trace-log-reverified.json` registra esa comprobación independiente. El runbook de latencia usa los selectores reales de Loki (`k8s_namespace_name`, `k8s_container_name`) y permite repetir el recorrido desde la alerta.

## Evidencia y cambios

- [Workflow `v1.0.3`](https://github.com/yaniadavid/Practicas-SA-B-202010175/actions/runs/38935995337) y [PR GitOps #8](https://github.com/yaniadavid/Practicas-SA-B-202010175-P8/pull/8).
- `P10/evidence/etapa5/analysis-run-no-samples.json`: protección cuando no hay muestras suficientes.
- `P10/evidence/etapa5/analysis-run-latency-failed.json` y `rollout-aborted.json`: rechazo por p95 y conservación de réplicas estables.
- `P10/evidence/etapa5/prometheus-during-canary.json`: consultas y valores previos al rechazo.
- `P10/evidence/etapa5/alert-to-cause.json`: tiempos, traza y registro causal.
- `P10/evidence/etapa5/recovery-load.jsonl`: solicitudes después de restaurar GitOps.
- `P10/evidence/etapa5/verification.json`: estado recuperado, alerta resuelta y contador SNS (3 notificaciones, 0 fallos; la etapa 4 tenía 2).
- Scripts reproducibles: `P10/scripts/run-canary-load.ps1`, `burst-canary-load.py` y `observe-canary-incident.py`.

## Guion breve de demostración

1. Mostrar el `AnalysisTemplate`: argumentos de servicio, ruta y hash; umbrales de 5xx y p95; mínimo de muestras.
2. Mostrar el PR #8 y el modo `slow` limitado a la candidata de mascotas.
3. Abrir el AnalysisRun del segundo intento: 5xx `0`, p95 `4.85`, estado `Failed`; abrir el Rollout abortado con 2 réplicas estables.
4. Mostrar `P10LatencyBudgetBurn` activo y el receptor SNS; enlazar el `trace_id` de la cita lenta con Tempo y el log de Loki.
5. Mostrar la medición de 0.5 segundos desde alerta detectada hasta causa confirmada, y cerrar con Argo CD `Synced/Healthy` y los POST de recuperación.

## Al cerrar la etapa

El clúster y los volúmenes continúan activos y generan cargos de AWS. La etapa 6 preparará el repositorio público nuevo, el informe final y el guion completo del video; no se inició aquí.
