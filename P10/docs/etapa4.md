# P10 - Etapa 4: SLO, presupuesto de error y tablero operativo

Estado: terminada y verificada en EKS. La etapa 5 requiere el visto bueno del estudiante.

## Objetivos acordados

Ambos objetivos son de **99.99% en una ventana móvil de 7 días** para `POST /api/appointments` observado en `api-gateway`. La ventana coincide con la retención configurada en Prometheus. Un objetivo de 99.99% permite una fracción mala de `0.0001`, equivalente a una solicitud mala por cada 10 000 elegibles.

| SLO | Solicitudes elegibles | Solicitudes buenas | Motivo |
| --- | --- | --- | --- |
| Disponibilidad | POST con respuesta 2xx, 3xx o 5xx | POST con respuesta 2xx o 3xx | Los 5xx son fallos del servicio. Los 4xx se excluyen porque corresponden a peticiones rechazadas por datos o autorización. |
| Latencia | POST con respuesta 2xx | POST 2xx completados en **≤ 1 segundo** | Mide la experiencia de una operación exitosa; los fallos HTTP se contabilizan en disponibilidad. |

`SLI = buenas / elegibles`. El **presupuesto consumido** es `malas / (elegibles × 0.0001)`; `1` significa 100% del presupuesto de la ventana. El **ritmo de consumo** (*burn rate*) aplica la misma fórmula a 5 minutos y 1 hora. Una alerta crítica requiere un ritmo `> 14.4` en ambas ventanas durante 2 minutos, con al menos 10 solicitudes elegibles en 5 minutos y 20 en 1 hora. Así se prioriza una degradación sostenida que agota el presupuesto, en lugar de una comparación instantánea con 99.99%.

Las reglas de grabación y alertas están en `P10/gitops/apps/observability/slo-rules/slo-rules.yaml`. Para medir exactamente el límite de 1 segundo, `v1.0.2` exporta `sa_http_request_duration_slo_seconds_bucket` con buckets explícitos, entre ellos `le="1"`. El nombre nuevo separa estas series del histograma anterior, cuyos buckets comenzaban en 5 segundos y que permanece en el historial de Prometheus. La instrumentación está en los tres servicios; el SLO de usuario toma las series del gateway.

El indicador de 7 días empieza a acumular datos al desplegar la instrumentación y solo representa una ventana completa después de 7 días. El 100% observado en esta etapa corresponde a las solicitudes de verificación, con tráfico limitado; no demuestra aún un cumplimiento sostenido de 99.99%. Sin solicitudes elegibles, los paneles de SLI quedan sin dato y se debe revisar el panel de tráfico.

## Alertas e intervención

`P10AvailabilityBudgetBurn` y `P10LatencyBudgetBurn` enlazan sus runbooks: `P10/runbooks/p10-availability.md` y `P10/runbooks/p10-latency.md`. Cada uno indica consultas de Prometheus, uso de Grafana, Loki y Tempo, comprobación de pods y la intervención apropiada. Los runbooks también están en el repositorio GitOps público, de modo que los enlaces `runbook_url` de las alertas son accesibles.

Alertmanager envía avisos mediante SNS `sa-p10-slo-alerts` al correo confirmado de la estudiante. Terraform crea el tema, la suscripción, una política limitada a `sns:Publish` sobre ese tema y la asociación EKS Pod Identity del servicio `monitoring-alertmanager`. La suscripción quedó confirmada. La configuración agrupa por nombre de alerta y SLO, espera 30 segundos, reagrupa cada 5 minutos y repite cada 4 horas. El aviso `Watchdog` conserva el receptor nulo del chart.

Se inyectó `P10NotificationSmokeTest` directamente en Alertmanager para comprobar el canal sin causar un 5xx ni degradar la aplicación. Alertmanager lo encaminó a `p10-slo-email`; la métrica del integrador SNS registró 2 notificaciones y 0 fallos (incluye la resolución). AWS muestra la suscripción confirmada. Esta comprobación acredita el envío de Alertmanager a SNS; la recepción en la bandeja de correo no fue inspeccionada.

## Tablero

El JSON exportable es `P10/gitops/apps/observability/dashboard/p10-operations.json`, generado por `P10/scripts/build-slo-dashboard.py`. Grafana lo aprovisiona mediante un ConfigMap de GitOps. Su UID es `p10-appointments-slo` y contiene 12 paneles para responder:

- **Latencia:** ¿Se acerca p95 a 1 segundo? ¿Cambió p50?
- **Tráfico:** ¿Cuántos POST de citas llegan por segundo?
- **Errores:** ¿Hay 5xx que expliquen el consumo del presupuesto?
- **Saturación:** ¿Qué fracción del límite de CPU y memoria usan gateway, citas y mascotas?
- **SLO:** ¿Se cumplen ambos objetivos y qué proporción del presupuesto de 7 días se consumió?

La captura real del tablero está en `P10/evidence/etapa4/dashboard.png`. Grafana responde con las fuentes Prometheus, Alertmanager, Loki y Tempo. El acceso al tablero dentro del clúster se puede abrir con `kubectl --kubeconfig P9/.runtime/kubeconfig -n observability port-forward svc/monitoring-grafana 3000:80` y la ruta `/d/p10-appointments-slo`.

## Verificación de la etapa

- `go test`, `go vet`, `node --check` y `node P10/tests/integration-local.mjs`: correctos.
- `helm template` del monitoring con su configuración de Alertmanager: correcto; receptor SNS y receptor nulo presentes.
- `kubectl kustomize` de reglas y tablero: correcto.
- `promtool check rules`: 22 reglas válidas.
- Terraform: 6 recursos añadidos, 0 modificados, 0 destruidos.
- [Workflow de imágenes `v1.0.2`](https://github.com/yaniadavid/Practicas-SA-B-202010175/actions/runs/38931175819): validación, compilación, Trivy, SBOM y firma correctos.
- [PR GitOps #7](https://github.com/yaniadavid/Practicas-SA-B-202010175-P8/pull/7): integrado; solo cambió las etiquetas de las tres imágenes.
- `p10-monitoring`, `p10-slo-rules`, `p10-dashboard`, `sa-platform-p8` y la aplicación raíz: `Synced` y `Healthy`. Los Rollouts gateway, citas y mascotas: `Healthy`, dos réplicas disponibles.
- Prometheus cargó ambas alertas con salud `ok` y estado `inactive`; el bucket de 1 segundo existe. En la verificación, ambos SLI valieron `1.0` y ambos presupuestos consumidos `0.0`.
- Grafana cargó los 12 paneles. Alertmanager cargó SNS y su prueba terminó sin fallos de notificación.

Los resultados estructurados están en `P10/evidence/etapa4/verification.json`. `p9-kyverno` sigue `Healthy` pero `OutOfSync` por la deriva de CRD ya observada en la etapa 3; no afecta los componentes P10.

## Al cerrar la etapa

El clúster y los volúmenes continúan activos y generan cargos de AWS. La etapa 5 implementará la relación entre presupuesto, canary y rollback, además de la prueba de incidente; no se inició aquí.
