# P10 - Etapa 1: base y diseño de observabilidad

Estado: revisión terminada. No se ha desplegado P10 ni se ha modificado el
repositorio GitOps. Continuar con la etapa 2 únicamente tras el visto bueno del
estudiante.

## Base comprobada

- La sesión AWS del perfil `yaniaaws` responde en la cuenta `536882095007`,
  región `us-east-1`.
- No hay clúster EKS. Tampoco existen el bucket de estado de Terraform P9, el
  bucket de Velero ni snapshots propios recuperables. El secreto
  `p9/sa-platform` sí existe en Secrets Manager y no está marcado para borrado.
  La siguiente puesta en marcha será nueva: `P9/scripts/bootstrap.ps1 -Apply`,
  sin `-RecoverData`. No se presentará como restauración de datos P9.
- El repositorio de código y el GitOps independiente tienen `main` accesible.
  GitOps está limpio localmente y conserva el chart, ArgoCD, Rollouts, Velero,
  External Secrets y Kyverno. El repositorio de código principal sigue siendo
  privado; la copia pública de entrega P10 será un repositorio nuevo.
- El AnalysisTemplate vigente `p8-http-smoke-analysis` ejecuta un Job con
  `curl /health`. Los Rollouts comparten ese análisis. Todavía no existe stack
  de observabilidad P10 ni medición de la candidata en Prometheus.

## Flujo elegido

`cliente -> api-gateway -> appointments-service -> pets-service`

La petición de creación de cita permitirá mostrar una sola traza entre tres
microservicios. Citas consultará la mascota antes de crear el registro y
propagará el contexto de OpenTelemetry. El identificador de traza estará en
los registros JSON de los tres servicios. PostgreSQL seguirá siendo el
almacén de citas, pero no cuenta como tercer microservicio.

## Señales y decisiones

- Las métricas HTTP llevarán nombre de servicio, ruta normalizada, clase de
  estado y hash del ReplicaSet. El hash separará la candidata de la estable
  en las consultas del AnalysisTemplate. Los identificadores de cita y traza
  no serán etiquetas de Prometheus.
- Dos métricas de negocio: citas creadas y solicitudes de cita rechazadas,
  con motivo de rechazo de cardinalidad fija.
- Stack previsto por GitOps: OpenTelemetry Collector para recibir telemetría,
  Prometheus y Alertmanager, Grafana, Loki y Tempo. Los registros JSON
  conservan `trace_id` para saltar entre Grafana/Tempo y Loki.
- Canary: tasa HTTP 5xx y p95 de latencia de la candidata, con un mínimo de
  muestras. Una consulta vacía o con pocas muestras no debe promover una
  versión. La prueba inducirá latencia en `pets-service` solo en la nueva
  revisión y mantendrá tráfico de creación de citas durante el análisis.
- SLO propuestos para calibrar con una línea base de tráfico: disponibilidad
  de la API de citas y tiempo de respuesta de creación de citas. Objetivo y
  ventana definitivos se fijarán con mediciones en la etapa 4; las alertas
  usarán consumo de presupuesto de error y runbook accionable.

## Dependencias de las siguientes etapas

1. Etapa 2: terminar y probar la instrumentación local de los tres servicios.
2. Etapa 3: publicar imágenes mediante CI y desplegar el stack por GitOps;
   reconstruir EKS desde cero después de verificar manifiestos y secreto.
3. Etapa 4: cerrar SLO, reglas, alertas, runbooks y tablero. El correo receptor
   será el correo indicado por la estudiante; si se usa SNS, su suscripción requerirá
   confirmación desde ese buzón.
4. Etapa 5: medir reversión y recorrido del síntoma a la causa con tráfico
   real, traza, registro y marcas de tiempo.
5. Etapa 6: preparar un repositorio público nuevo de P10, enlaces, informe y
   guion. El estudiante grabará y publicará el video.

## Criterio de salida de la etapa 1

La arquitectura, las fuentes de señal, el camino de tres servicios y el estado
real de la infraestructura quedaron identificados. No hay resultado operativo
que atribuir a P10 todavía.
