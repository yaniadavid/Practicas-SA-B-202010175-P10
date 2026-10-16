# P10AvailabilityBudgetBurn

## Qué significa

El gateway respondió 5xx a `POST /api/appointments` a un ritmo superior a 14.4 veces el presupuesto permitido por el SLO de 99.99%, tanto en 5 minutos como en 1 hora. La regla requiere al menos 10 solicitudes elegibles en 5 minutos y 20 en 1 hora. Los 4xx se excluyen porque reflejan peticiones que la API rechazó por datos o autorización; no representan fallas del servicio.

## Diagnóstico

1. Abrir el tablero **P10 · Citas · SLO y señales de oro**. Leer *Disponibilidad 7d*, *Presupuesto disponibilidad consumido*, *Errores 5xx* y *Tráfico*.
2. En Prometheus comparar `p10:availability:burn5m`, `p10:availability:burn1h` y `p10:availability:eligible:increase5m`. Confirmar que las series recientes existen y que el tráfico mínimo se cumple.
3. En Grafana Explore → Loki filtrar `{k8s_namespace_name="sa-p8", k8s_container_name="api-gateway"} | json | level="error"` y luego citas y mascotas. Abrir un `trace_id` de error en Tempo para localizar el salto fallido.
4. Revisar pods, restarts y eventos: `kubectl --kubeconfig P9/.runtime/kubeconfig -n sa-p8 get pods` y `kubectl --kubeconfig P9/.runtime/kubeconfig -n sa-p8 get events --sort-by=.lastTimestamp`.

## Intervención

Si los fallos empezaron tras una versión candidata, detener su promoción y revisar el AnalysisRun antes de avanzar. Si el fallo afecta a la versión estable, corregir la dependencia o configuración identificada por trazas y logs. Registrar hora, causa, número de 5xx y presupuesto consumido. Verificar que `p10:availability:burn5m` vuelve a cero y que el alertado se resuelve. El procedimiento de canary y rollback se implementa en la etapa 5.

No se considera recuperado el SLO de 7 días hasta que su indicador lo demuestre; una alerta resuelta solo indica que cesó el consumo rápido.
