# P10 - Etapa 3: imágenes y observabilidad por GitOps

Estado: terminada y verificada en EKS. Continuar con la etapa 4 únicamente
después del visto bueno del estudiante.

## Flujo de publicación

El workflow `.github/workflows/p10-observability.yml` valida código y Helm,
construye las imágenes P10, bloquea vulnerabilidades críticas corregibles con
Trivy, conserva un SBOM CycloneDX por imagen y firma con Cosign. Al final abre
un pull request en el repositorio GitOps para cambiar solamente las tres
imágenes de la plataforma. Argo CD aplica las etiquetas integradas a `main`.

| Servicio | Imagen |
| --- | --- |
| API gateway | `ghcr.io/yaniadavid/practicas-sa-b-202010175/p10-api-gateway:v1.0.1` |
| Citas | `ghcr.io/yaniadavid/practicas-sa-b-202010175/p10-appointments-service:v1.0.1` |
| Mascotas | `ghcr.io/yaniadavid/practicas-sa-b-202010175/p10-pets-service:v1.0.1` |

## Despliegue declarativo

El repositorio GitOps `Practicas-SA-B-202010175-P8` conserva el chart de la
plataforma y añade cinco Applications bajo `bootstrap/apps`. Los valores se
guardan en `apps/observability`. Una copia de esos manifiestos queda en
`P10/gitops` para la entrega de la práctica.

| Orden | Application | Componentes |
| --- | --- | --- |
| 1 | `p10-monitoring` | Prometheus, Alertmanager y Grafana |
| 2 | `p10-loki`, `p10-tempo` | Registros y trazas |
| 3 | `p10-otel-collector`, `p10-otel-logs` | Receptor OTLP y recolección de logs JSON |
| 10 | Plataforma existente | Servicios en `sa-p8` con imágenes P10 |

El clúster `sa-p9-202010175` se creó desde cero en `us-east-1`, con dos nodos
`Ready`. No se ejecutó recuperación de datos P9. Los servicios envían trazas y métricas a
`otel-collector.observability.svc.cluster.local:4318`. El Collector envía
trazas a Tempo y métricas al receptor OTLP de Prometheus. Un DaemonSet lee los
logs de pods de `sa-p8` y los envía a Loki. Grafana tiene fuentes de datos
Prometheus, Tempo y Loki; la fuente Loki incorpora el enlace del `trace_id`
hacia Tempo. Las métricas llevan el hash del pod de Argo Rollouts para medir
versiones candidatas en una etapa posterior.

## Comprobaciones de esta etapa

- `helm lint` del chart GitOps con valores `values-p8.yaml`: correcto.
- `helm template` de los cinco charts de observabilidad: correcto.
- Se verificaron en los manifiestos los servicios y puertos usados por las
  exportaciones OTLP y por Grafana.
- Preflight de `P9/scripts/bootstrap.ps1 -AwsProfile yaniaaws`: correcto.
- El primer análisis bloqueó la imagen de mascotas por
  `CVE-2026-33186` en `google.golang.org/grpc` 1.77.0. Se actualizó a
  1.79.3; `go test` y `go vet` volvieron a pasar.
- [Workflow `v1.0.1`](https://github.com/yaniadavid/Practicas-SA-B-202010175/actions/runs/38926473683):
  validación, compilación, análisis, SBOM y firma correctos para las tres
  imágenes.
- [PR GitOps #6](https://github.com/yaniadavid/Practicas-SA-B-202010175-P8/pull/6):
  integrado; cambió únicamente las imágenes del gateway, citas y mascotas.
- Las cinco aplicaciones P10 y `sa-platform-p8` están `Synced` y `Healthy`.
  Todos los pods de observabilidad y plataforma están listos.
- Una petición `POST /api/appointments` devolvió HTTP 201 con `trace_id`
  `1cf4886c5aa71138a3aa9429b545de65`. Tempo devolvió HTTP 200 y spans de
  gateway, citas y mascotas. Loki devolvió un log JSON de cada servicio con
  ese mismo ID.
- Prometheus expuso `sa_http_requests_total` para la petición de citas, con
  `rollout_hash=866b9994c6`; `sa_appointments_created_total` valió 1 y el
  histograma `sa_http_request_duration_seconds_bucket` tenía series.
- Grafana respondió `database: ok` y sus fuentes Prometheus, Alertmanager,
  Loki y Tempo quedaron configuradas. La fuente Loki muestra el enlace
  `trace_id` hacia Tempo.

La evidencia estructurada está en `P10/evidence/etapa3/verification.json`.
La aplicación heredada `p9-kyverno` está `Healthy` pero informa `OutOfSync`
en CRD del chart; no impide que la aplicación raíz, la plataforma y las cinco
aplicaciones P10 estén `Synced` y `Healthy`.

## Estado al cerrar la etapa

El clúster y sus volúmenes siguen activos para las etapas 4 y 5 y generan
cargos de AWS. No hay reglas SLO, tablero P10 ni canary gobernado por métricas
todavía; pertenecen a las próximas etapas aprobadas por separado.
