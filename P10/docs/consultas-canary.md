# Consultas que deciden la promoción del canary

El [`AnalysisTemplate` de GitOps](https://github.com/yaniadavid/Practicas-SA-B-202010175-P8/blob/main/charts/sa-platform/templates/p10-canary-analysis.yaml) recibe `service-name`, `route`, `method` y `canary-hash`. Argo Rollouts resuelve estos argumentos para la versión candidata; la consulta no mezcla réplicas estables. Las expresiones siguientes son las del manifiesto, con los argumentos ya expresados como selectores PromQL. Para mascotas en el ensayo medido: `service-name=pets-service`, `route=/pets/:id`, `method=GET`, `canary-hash=679cb87476`.

## Porcentaje de HTTP 5xx

```promql
(
  (
    (sum(increase(sa_http_requests_total{job="pets-service",route="/pets/:id",method="GET",rollout_hash="679cb87476",status_class="5xx"}[2m])) or vector(0))
    /
    clamp_min(sum(increase(sa_http_requests_total{job="pets-service",route="/pets/:id",method="GET",rollout_hash="679cb87476",status_class=~"2xx|3xx|5xx"}[2m])), 1)
  )
  and on() (sum(increase(sa_http_requests_total{job="pets-service",route="/pets/:id",method="GET",rollout_hash="679cb87476",status_class=~"2xx|3xx|5xx"}[2m])) >= 10)
) or on() vector(-1)
```

Resultado aceptable: entre `0` y `0.01`, inclusive. `-1` indica menos de 10 solicitudes elegibles o ausencia de datos y bloquea la promoción.

## p95 de latencia en segundos

```promql
(
  histogram_quantile(0.95,
    sum by (le) (rate(sa_http_request_duration_slo_seconds_bucket{job="pets-service",route="/pets/:id",method="GET",rollout_hash="679cb87476",status_class=~"2xx|3xx"}[2m]))
  )
  and on() (sum(increase(sa_http_request_duration_slo_seconds_bucket{job="pets-service",route="/pets/:id",method="GET",rollout_hash="679cb87476",status_class=~"2xx|3xx",le="+Inf"}[2m])) >= 10)
) or on() vector(-1)
```

Resultado aceptable: entre `0` y `1` segundo, inclusive. El análisis del ensayo devolvió 5xx `0` y p95 `4.85`, por lo que `pets-service-679cb87476-4-2` falló y Argo abortó `pets-service`. El p95 es una estimación del histograma; las solicitudes individuales duraron aproximadamente 2.2 segundos.

En los Rollouts de gateway y citas se utilizan las mismas expresiones con `POST /api/appointments` y `POST /appointments`, respectivamente, y el hash de su propia candidata. Cada métrica toma tres mediciones separadas por 15 segundos y `failureLimit: 0`.
