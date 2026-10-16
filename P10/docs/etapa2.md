# P10 - Etapa 2: instrumentación de tres servicios

Estado: terminada y verificada localmente. No hay imágenes publicadas ni
despliegue P10. Continuar con la etapa 3 solamente con el visto bueno del
estudiante.

## Servicios instrumentados

| Servicio | Código P10 | Señal propia |
| --- | --- | --- |
| API gateway | `P10/services/api-gateway` | Entrada HTTP y propagación del contexto al servicio de citas. |
| Citas | `P10/services/appointments-service` | Entrada HTTP, consulta con contexto propagado a mascotas, citas creadas y solicitudes rechazadas. |
| Mascotas | `P10/services/pets-service` | Entrada HTTP, búsqueda de mascota por ID y registros del fallo inducible. |

Los tres usan SDK OpenTelemetry y exportan trazas y métricas por OTLP HTTP.
Cada entrada HTTP crea un span servidor; el gateway inyecta `traceparent` al
reenviar la petición y citas lo inyecta en la llamada a mascotas. Una petición
de creación de cita forma una sola traza entre los tres servicios. Los
registros salen como una línea JSON con `timestamp`, `level`, `service`,
`message`, `trace_id` y `span_id`. No registran el token de escritura.

## Métricas

- `sa_http_requests`: contador por servicio, ruta normalizada, método, clase
  de respuesta y `rollout_hash`.
- `sa_http_request_duration`: histograma en segundos con las mismas
  dimensiones; servirá para p95 del canary.
- `sa_appointments_created`: contador de citas creadas correctamente.
- `sa_appointments_rejected`: contador de solicitudes rechazadas, con motivo
  de cardinalidad fija (`unauthorized`, `invalid_json`, `invalid_input` o
  `pet_not_found`).

No se agregan IDs de usuario, cita o traza como etiquetas de métricas. El hash
de Rollouts se leerá de la etiqueta del pod al desplegar en la etapa 3; en
local se fija a `local-test`.

## Comportamiento funcional incorporado

Al crear una cita, el servicio comprueba que `petId` exista en mascotas. Un
ID desconocido devuelve HTTP 422. Si mascotas no está disponible, citas
devuelve HTTP 503. La búsqueda `GET /pets/:id` en mascotas acepta
`P10_FAULT_MODE=slow` para sumar dos segundos de latencia o `error` para
responder HTTP 503. El valor por defecto no induce fallos. El fallo se usará
solo en la versión candidata durante la etapa 5.

## Verificación local

Desde la raíz del repositorio, con el binario Go construido en
`P10/.runtime/pets-service.exe`:

```powershell
cd P10/services/pets-service
go mod tidy
go test ./...
go vet ./...
go build -o ../../.runtime/pets-service.exe .
cd ../../..
node P10/tests/integration-local.mjs
```

El 16/10/2026 la prueba de integración devolvió `PASS`: una cita válida llegó
a los tres servicios con el mismo `trace_id`
`8a09554a14a0bc7715616917a3313f45`; otra con mascota inexistente devolvió
422. El receptor OTLP de prueba recibió siete exportaciones y comprobó spans
de los tres servicios con ese ID, el contador de citas creadas y el histograma
de latencia. Los
archivos JavaScript pasaron `node --check`; `go test` (incluida la búsqueda
válida, desconocida y el fallo inducido) y `go vet` finalizaron correctamente.
La instalación limpia `npm ci --omit=dev` pasó en ambos servicios Node y
reportó cero vulnerabilidades.

Docker Desktop no estaba iniciado, por lo que no se ejecutó una construcción
local de imágenes. Los tres Dockerfiles quedan listos para validarse en el
pipeline de la etapa 3.

## Criterio de salida

Código, dependencias y prueba local reproducible disponibles. Propagación del
contexto, registros JSON y exportación OTLP comprobadas sin depender del
clúster. AWS y el repositorio GitOps no se modificaron en esta etapa.
