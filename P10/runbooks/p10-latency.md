# P10LatencyBudgetBurn

## Qué significa

Entre los `POST /api/appointments` exitosos, la proporción que tardó más de 1 segundo consume el presupuesto del SLO de 99.99% a más de 14.4 veces el ritmo permitido en 5 minutos y 1 hora. La regla exige al menos 10 solicitudes elegibles en 5 minutos y 20 en 1 hora. Los errores HTTP se analizan en el SLO de disponibilidad para no contabilizarlos dos veces.

## Diagnóstico

1. Abrir **P10 · Citas · SLO y señales de oro**. Comparar *Latencia p95*, *Presupuesto latencia consumido*, *Tráfico* y *Saturación*.
2. Consultar `p10:latency:burn5m`, `p10:latency:burn1h` y `p10:latency:eligible:increase5m`; comprobar que el bucket `le="1"` de `sa_http_request_duration_slo_seconds_bucket` tiene datos.
3. En Tempo buscar trazas lentas de `POST /api/appointments` y localizar el span que más tarda. Usar el `trace_id` para revisar logs en Loki con `{k8s_namespace_name="sa-p8"} | json | trace_id="<id>"`; el evento `pet_lookup_injected_delay` identifica la demora de prueba en mascotas.
4. Verificar CPU y memoria de los pods `sa-p8`, reinicios y dependencias. Comprobar si el aumento coincide con un despliegue o con mayor tráfico.

## Intervención

Si la regresión apareció con una versión candidata, detener su promoción y conservar las trazas para el análisis. Si proviene de saturación, ajustar la capacidad o resolver el cuello de botella identificado; si proviene de una dependencia, corregirla. Registrar hora, porcentaje de solicitudes mayores de 1 segundo y presupuesto consumido. Confirmar que el burn de 5 minutos vuelve a cero. El rollback automático se implementa en la etapa 5.

El presupuesto de 7 días conserva los eventos lentos hasta que salgan de la ventana; la resolución de la alerta no borra el consumo pasado.
