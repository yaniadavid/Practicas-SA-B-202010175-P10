# Informe de operación - Práctica 10

**Carné:** 202010175 · **Flujo:** `POST /api/appointments` → citas → mascotas · **Fuente:** evidencia de P10, etapas 3 a 5.

## 1. SLO declarados

Disponibilidad: **99.99% en 7 días** para POST de citas que responden 2xx, 3xx o 5xx; son buenas las respuestas 2xx y 3xx. Los 4xx se excluyen porque representan solicitudes rechazadas por datos o autorización. Latencia: **99.99% en 7 días** de los POST 2xx completados en **≤ 1 segundo**. Se eligió 99.99% para exigir como máximo una operación mala por cada 10 000 elegibles y observar el consumo del presupuesto, según el objetivo alto acordado. El tráfico de laboratorio todavía no demuestra siete días continuos de cumplimiento; el tablero muestra la ventana parcial disponible.

## 2. Fallo inducido

La candidata `v1.0.3` de `pets-service` activó `P10_FAULT_MODE=slow` por GitOps. Cada `GET /pets/:id` de esa revisión añadió 2 segundos, anotó el span `p10.fault_mode=slow` y emitió el log `pet_lookup_injected_delay`. La versión estable `v1.0.2` permaneció disponible. El fallo fue de latencia, distinto del ensayo de disponibilidad de la Práctica 8. La candidata recibió carga medida por Prometheus; el AnalysisRun `pets-service-679cb87476-4-2` rechazó p95 `4.85 s` con 5xx `0` y Argo Rollouts abortó sin intervención manual.

## 3. Tiempo de detección

La primera solicitud completa afectada comenzó a las **17:09:30.294 UTC** y terminó en 2269.8 ms. La primera alerta operativa archivada, `P10LatencyBudgetBurn`, se activó a las **17:12:11.475 UTC**: **2 min 41.2 s** desde el comienzo de esa solicitud. La regla exigía consumo del presupuesto `> 14.4×` en 5 minutos y 1 hora durante 2 minutos. Antes del disparo, Prometheus ya medía p95 elevado, pero no se archivó una marca exacta de su primera evaluación; por ello el tiempo reportado se refiere a la alerta activa.

## 4. Recorrido hasta la causa

Alertmanager encaminó la alerta al receptor SNS. El observador la detectó a las **17:12:14.594 UTC**; abrió en Tempo la traza `c6cf9eaa0c618faa99e4ed7197567e8c`, que contenía gateway, citas y mascotas. El span de mascotas mostró 2000.4 ms de demora inducida. Con el mismo `trace_id` consultó Loki y encontró `pet_lookup_injected_delay`, `delay_ms=2000`. La causa quedó confirmada a las **17:12:15.142 UTC**: **0.5 s** desde la detección de la alerta, por debajo del objetivo de 3 minutos. La traza y el log se verificaron de nuevo al preparar la entrega.

## 5. Tiempo de recuperación

Argo abortó la candidata a las **17:12:50 UTC**, **3 min 19.7 s** después de la primera solicitud afectada y 38.5 s después de la alerta activa. Conservó dos réplicas estables disponibles durante el ensayo. La retirada posterior de `faultMode` en GitOps fue limpieza, no la causa del rollback. A las **17:15:27.571 UTC** se verificaron Argo CD `Synced/Healthy`, Rollout `Healthy`, alerta `inactive` y tres POST de recuperación con HTTP 201 en 214-360 ms. La verificación estable ocurrió **5 min 57.3 s** después del primer impacto.

## 6. Alerta faltante o sobrante

La alerta de presupuesto fue útil para el impacto observado por usuarios: tuvo tráfico mínimo, esperó degradación sostenida y llevó al runbook. Una señal **no paginable** al canal de despliegues cuando el p95 de la candidata supera 1 segundo con al menos 10 muestras habría avisado antes al responsable del cambio, sin despertar al operador por un canary que Argo revierte solo. No se propone otra alerta crítica instantánea: duplicaría el aviso de presupuesto y añadiría ruido.

**Evidencia:** [AnalysisRun](../evidence/etapa5/analysis-run-latency-failed.json), [alerta y recorrido](../evidence/etapa5/alert-to-cause.json), [traza y log comprobados](../evidence/etapa5/trace-log-reverified.json), [estado final](../evidence/etapa5/verification.json).
