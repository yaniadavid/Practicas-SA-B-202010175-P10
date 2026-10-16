# P10 - Etapa 6: entrega pública e informe

Estado: entregables a cargo del asistente terminados. La estudiante grabará y publicará el video; entonces debe añadirse su URL a la tabla de `P10/README.md`.

## Repositorios

- [Código P10 público](https://github.com/yaniadavid/Practicas-SA-B-202010175-P10): contiene únicamente `P10/`, el workflow de CI y un README raíz que lleva a la tabla de entrega.
- [GitOps público](https://github.com/yaniadavid/Practicas-SA-B-202010175-P8): conserva los manifiestos activos del stack y el AnalysisTemplate. El archivo `P10/gitops/platform/values-p8.yaml` se sincronizó con la versión estable `v1.0.2` desplegada.
- El repositorio de trabajo original permanece privado. Se publicó un [resumen de las tres ejecuciones de CI](../evidence/ci-verification.json) para que sus estados y trabajos sean consultables sin acceder al repositorio original. La copia pública del workflow permite inspeccionar las pruebas, Trivy, SBOM, Cosign y la promoción por PR; para ejecutarla desde el repositorio nuevo se debe configurar `SA_TOKEN`.

## Entregables

`P10/README.md` contiene la tabla obligatoria de enlaces. Incluye nombres de los tres servicios, namespace, AnalysisTemplate, consultas PromQL, SLO, reglas, tablero, AnalysisRun fallido y recorrido alerta → traza → log. Se añadió el [diagrama de telemetría](flujo-telemetria.md) y el [informe de operación](informe-operacion.pdf), que ocupa una página y responde los seis campos de la plantilla. El [guion de video](guion-video.md) cubre siete minutos con la pantalla y narración sugerida por segmento.

La evidencia `alert-to-cause.json` se corrigió durante esta etapa: un observador antiguo había sobrescrito el resultado confirmado del segundo intento. Se conservó su salida en `alert-to-cause-first-observer.json`; `trace-log-reverified.json` documenta la nueva consulta a Tempo y Loki, que encontró los tres servicios y el log causal. El informe identifica explícitamente que el tiempo de detección se cuenta hasta la alerta activa, porque no se archivó la primera evaluación elevada de Prometheus.

## Comprobaciones

- Repositorio P10 creado como **público** en la cuenta `yaniadavid`; rama `main` publicada.
- Acceso sin autenticación confirmado para README, informe PDF, guion, diagrama, PromQL, AnalysisRun, traza/log, tablero y workflow. El repositorio GitOps público responde para AnalysisTemplate, reglas y ambos runbooks.
- Enlaces relativos de los Markdown de la copia pública: ninguno ausente.
- Informe PDF renderizado e inspeccionado: **1 página**, seis campos legibles y cuatro enlaces a evidencia.
- Archivos de ejecución local, binarios y secretos omitidos de la copia pública; el correo personal se sustituyó por una descripción del destinatario confirmado.
- Argo CD `sa-platform-p8` y el Rollout estable terminaron `Synced/Healthy`; la alerta quedó `inactive`, según la evidencia de la etapa 5.

## Acción pendiente de la estudiante

Grabar y publicar el video de 5 a 8 minutos siguiendo `docs/guion-video.md`; después sustituir en la tabla del README la fila **Video demostrativo** por su URL pública. El minutaje ya está preparado. El clúster AWS permanece activo para que pueda grabarse una demostración en vivo y genera cargos mientras siga encendido; no se apagó en esta etapa. GitHub y AWS no requieren cerrar el acceso para entregar P10. Cuando el video esté grabado, se puede decidir si se apaga la infraestructura.
