# 34 dolores argentinos

_Investigación de oportunidades · Argentina · Septiembre 2026_

Un barrido de problemas reales —comercios, profesionales, PyMEs— con la competencia local verificada, precios de mercado y un veredicto honesto sobre cuáles valen la pena. Spoiler: el Excel ya no es la oportunidad.

## El hallazgo que cambia la tesis

Empecé buscando negocios que “todavía usan Excel”. Encontré otra cosa.

La narrativa cómoda dice que Argentina es un mercado sin digitalizar y que alcanza con hacer una app decente para cualquier rubro que hoy vive en planillas. **Eso ya no es cierto en la mayoría de los nichos obvios.** Rubro por rubro, lo que encontré fue esto:

Talleres mecánicos: TallerTrack, TallerPro, AutoSoft, AppTaller, WOMS, Balance Garage, BUJIA. Alquileres: Rentaloop, Barreeo, TusAlquileres, mialquiler.ar, Inmosoft, Rents, SimpleProp — casi todos con ICL/IPC automático y varios con IA. Estudios jurídicos: Veredicta, MetaJurídico, RivoLegal, LITIS, todos con scraping de PJN y MEV. Gimnasios: CLUBIO, GymSmartAccess, LumiaFit. RRHH: ArcanRH, Legajo.ar, FirmaLaboral, Factorial. Fiado de almacén: Cobrando.app, GranLoop, Cuentas Claras, Mercado Fiado. Comprobantes contables con IA: Fex (220 empresas, comprobantes por US$ 1.100 millones en compras) y Contapilot. Facturación por WhatsApp: Facturitas, a $4.999/mes.

Y no son productos viejos: buena parte publicó su landing o su blog en 2025 y 2026, ya hablando de agentes de IA. La ventana “digitalizá lo analógico” se cerró mientras nadie miraba.

**Dónde quedó la oportunidad**

En tres lugares concretos, y conviene tenerlos presentes al leer todo lo que sigue:

**1 · El borde entre dos actores.** Los sistemas cubren bien lo que pasa _adentro_ de una empresa. Lo que sigue roto es el intercambio: el proveedor que manda la lista de precios en PDF, la obra social que devuelve un débito, el cliente que manda el comprobante por WhatsApp. Ahí no hay dueño del problema, y por eso nadie lo resolvió.

**2 · La obligación con fecha.** Un cambio normativo crea demanda con vencimiento y sin incumbente. La RG 5824/2026 de ARCA, vigente desde el 1 de julio de 2026, obligó a facturar electrónicamente a sujetos que estaban exentos hace décadas: entidades educativas, prepagas, aseguradoras, directores de SA, socios gerentes de SRL y profesionales que cobran honorarios en juicios.

**3 · El nicho demasiado chico para el incumbente.** Un producto que factura $8 millones por mes es irrelevante para Flexxus y transformador para una persona. Los segmentos de 200-800 clientes están libres porque a nadie con equipo le cierran.

**Lo que esto implica para vos**

Opinara compite en una categoría donde el propio Google regala la munición: desde su panel se genera un **link y un QR de reseñas nativo, gratis**, y hay vendedores argentinos que venden la placa QR física como producto suelto. El QR no es el producto. Lo defendible es el filtro previo (qué feedback llega a Google y cuál no), la respuesta asistida y la operación multi-sucursal. Lo digo en la sección de adyacencia con números, no como opinión suelta.

## Cómo puntué

El Opportunity Score no es una impresión: es un promedio ponderado de nueve ejes, con pesos elegidos para un desarrollador solo sin capital ni equipo comercial.

Dolor 15% · Impacto económico 15% · Disposición a pagar 15% · Frecuencia 10% · Usuarios potenciales 10% · Competencia favorable 10% · Facilidad de adquisición 10% · Facilidad de MVP 10% · Potencial de expansión 5%

**Por qué esos pesos.** Dolor, impacto y disposición a pagar valen 45% combinado porque un problema que nadie paga no es una oportunidad, es un hobby. Facilidad de adquisición pesa tanto como el tamaño del mercado: un mercado de 50.000 comercios al que no podés llegar vale menos que uno de 900 estudios a los que sí. Expansión pesa solo 5% a propósito — es la variable con la que uno se miente para justificar una idea débil.

**Ajuste de adyacencia.** Sumé un bonus por reuso de lo que ya construiste en Opinara (multi-tenant por `businessUrn`, OAuth de Google, QR y páginas públicas, sync con cron y backoff, integraciones detrás de adapters) o por compartir canal de venta: alta +0,30 media +0,15 baja +0,05. Es un bonus chico a propósito: la adyacencia acelera el MVP, no arregla un mercado malo.

**“Competencia favorable” se lee al revés de lo intuitivo:** 9 significa que el campo está despejado, 3 significa que hay seis competidores locales financiados. Bajé esta nota sin piedad cada vez que encontré tres o más productos argentinos activos.

**Señal de evidencia.** ✔ = encontré fuente verificable (producto, precio, nota, normativa, posteo describiendo el problema). ○ = es criterio mío y todavía no está probado. No inventé citas: donde no hallé evidencia, lo dice.

## Los 34 problemas

Ordenados por categoría, no por calidad. La columna de veredicto es la que importa: 10 pasan a la ronda final, 12 quedan descartados con motivo escrito y el resto queda en observación.

| # | Problema | Usuario | Frec. | Workaround actual | Señal | Veredicto |
|---|---|---|---|---|---|---|
| 01 | Cargar la lista de precios que manda el proveedor | Distribuidoras, ferreterías, corralones, farmacias | Quincenal | PDF o Excel distinto por proveedor, carga a mano: media jornada | ✔ | Top #1 |
| 02 | Remarcar sin saber el margen real contra costo de reposición | Todo comercio con stock | Quincenal | Fórmula de % en Excel, o a ojo | ✔ | Top #1 |
| 03 | Fiado y cuenta corriente de clientes | Almacenes, kioscos, despensas | Diaria | Cuaderno, papeles sueltos, memoria del dueño | ✔ | Descartado |
| 04 | Conciliar Mercado Pago + transferencias + efectivo contra las ventas del día | Todo comercio | Diaria | App del banco, app de MP y planilla, movimiento por movimiento | ✔ | Top #6 |
| 05 | Comprobantes de transferencia falsos en el mostrador | Comercios con atención presencial | Semanal | Mirar la captura de pantalla que muestra el cliente | ✔ | Top #6 |
| 06 | Pedidos a proveedores sin registro de qué se pidió | Comercios chicos | Semanal | WhatsApp y memoria | ○ | Descartado |
| 07 | Diferencias entre el stock del sistema y el real | Autoservicios, minimercados | Mensual | Conteo manual cada tanto, o nunca | ○ | Observar |
| 08 | Vender por WhatsApp sin pagar comisión de apps de delivery | Gastronomía, dietéticas, rotiserías | Diaria | WhatsApp Business + lista de precios en PDF | ○ | Descartado |
| 09 | Ficha de Google desactualizada y reseñas sin responder | Comercios y cadenas con sucursales | Semanal | Nadie se ocupa, o una agencia cobra por hacerlo a mano | ✔ | Top #8 |
| 10 | Fidelización con tarjetita de sellos de cartón | Cafeterías, peluquerías, lavaderos | Diaria | Cartón y sello de goma | ○ | Descartado |
| 11 | Facturar a obras sociales y pelear los débitos y rechazos | Consultorios, centros, kinesiología, laboratorios | Mensual | Excel cruzado a mano con el portal de cada obra social | ✔ | Top #2 |
| 12 | Turnos que se pierden por ausentismo sin seña | Salud, estética, oficios a domicilio | Diaria | Agenda de papel o Google Calendar + recordatorio manual por WhatsApp | ✔ | Top #5 |
| 13 | Clientes que mandan comprobantes al estudio por WhatsApp | Estudios contables | Mensual | Carpeta de fotos y carga manual al sistema | ✔ | Descartado |
| 14 | Nuevos obligados a facturar por RG 5824: directores de SA, socios gerentes de SRL, honorarios judiciales | Estudios contables y sus clientes | Mensual | El contador emite una por una en el portal de ARCA | ✔ | Top #4 |
| 15 | Seguimiento de expedientes en PJN, MEV y EJE | Abogados y estudios jurídicos | Diaria | Entrar a cada portal a mano, todos los días | ✔ | Descartado |
| 16 | Presupuestar con precios de materiales que cambiaron desde ayer | Electricistas, plomeros, constructoras chicas | Semanal | Excel viejo + llamar al corralón | ○ | Descartado |
| 17 | Receta electrónica e historia clínica en el consultorio de una persona | Médicos que atienden solos | Diaria | Recetario en papel y cuaderno | ○ | Observar |
| 18 | Cobrar honorarios a pacientes particulares y perseguir la mora | Psicólogos, kinesiólogos, profesores particulares | Mensual | Acordarse y mandar el alias por WhatsApp | ○ | Observar |
| 19 | Vencimientos de matrícula, seguro de mala praxis y trámites propios | Cualquier profesional matriculado | Anual | Memoria y mails del colegio profesional | ○ | Descartado |
| 20 | Cobranza B2B: facturas impagas, recordatorios y cuenta corriente | PyMEs que venden a crédito | Diaria | Excel de vencimientos y llamados de la administrativa | ✔ | Top #3 |
| 21 | Documentación de proveedores y contratistas al día: F.931, ART, seguros, constancias | Industria, construcción, logística, shoppings | Mensual | Mails sueltos y una carpeta compartida que nadie audita | ○ | Top #7 |
| 22 | Rendición de gastos y caja chica | PyMEs con gente en la calle | Semanal | Fotos de tickets por WhatsApp y un Excel al cierre del mes | ✔ | Top #10 |
| 23 | Retenciones y percepciones multi-jurisdicción (IIBB, SIRCREB) | PyMEs que venden en varias provincias | Mensual | Excel del contador, padrones bajados a mano | ○ | Descartado |
| 24 | Pedir y comparar tres presupuestos a proveedores | Compras de PyME | Semanal | Mails sueltos, WhatsApp, y una planilla comparativa a mano | ○ | Descartado |
| 25 | Asistencia, licencias y vacaciones según convenio | PyMEs con 10-80 empleados | Diaria | Planilla de Excel y reloj fichador | ✔ | Descartado |
| 26 | Vencimientos de habilitaciones, matafuegos, ascensores y seguros | PyMEs, consorcios, flotas | Trimestral | Calendario, memoria y el aviso del proveedor | ✔ | Top #9 |
| 27 | Actualizar contratos de servicios por índice y avisarle al cliente | Agencias, seguridad, limpieza, servicios B2B | Mensual | Excel con el índice y un mail redactado a mano | ○ | Observar |
| 28 | Información crítica enterrada en grupos de WhatsApp | Cualquier empresa | Diaria | WhatsApp, y buscar hacia arriba | ○ | Descartado |
| 29 | Liquidación de expensas y comunicación del consorcio | Administradores de consorcios | Mensual | Excel: entre 8 y 16 horas por edificio | ✔ | Descartado |
| 30 | Alquiler: actualización por índice, recibos y reclamos | Inquilinos, propietarios, inmobiliarias | Mensual | La inmobiliaria con su Excel y WhatsApp | ✔ | Descartado |
| 31 | Vencimientos del auto y del hogar: VTV, seguro, patente, cédula | Personas | Trimestral | Memoria, y el mail del broker cuando se acuerda | ○ | Descartado |
| 32 | Comprar un usado sin saber deuda, infracciones ni estado de dominio | Personas | Excepcional | Pagarle a un gestor | ○ | Descartado |
| 33 | Colegios privados obligados a emitir comprobante electrónico por familia | Colegios, institutos, universidades privadas | Mensual | Resumen de cuenta interno — práctica que dejó de ser válida el 1/7/2026 | ✔ | Top #4 |
| 34 | Órdenes de reparación y “¿cómo viene lo mío?” | Servicio técnico de celulares, electro, bicicleterías | Diaria | Talonario numerado y WhatsApp con cada cliente | ✔ | Observar |

## Los descartes, con el motivo escrito

Esta sección existe para que el informe no sea una lista de entusiasmo. Doce problemas reales que igual no construiría.

| Problema | Por qué no |
|---|---|
| Fiado de almacén | El dolor es real, pero el almacenero de barrio es el peor pagador de software del país y ya hay al menos cuatro apps argentinas compitiendo por ese peso: Cobrando.app, GranLoop, Cuentas Claras y Mercado Fiado. Techo de precio: cero. |
| Expensas y consorcios | Mercado probado y pain enorme (8-16 horas de Excel por edificio), pero CONSO ya publica precio —$2.950 por unidad funcional/mes— con OCR e IA incluidos, y hay más de diez plataformas comparándose. Entrar acá en 2026 es llegar tarde a una fiesta cara. |
| Alquileres e inmobiliarias | Siete productos argentinos activos, todos con ICL/IPC/UVA automático y varios con IA. Rango de precio $15.000-$80.000/mes. No hay ángulo libre sin una red inmobiliaria previa. |
| Expedientes judiciales | Veredicta, MetaJurídico, RivoLegal y LITIS ya scrapean PJN, MEV, EJE y SRT varias veces por día. MetaJurídico arranca en $11.999/mes. La barrera técnica que uno creería tener, ya la saltaron cuatro. |
| Comprobantes al estudio contable | Fex ya procesa comprobantes por más de US$ 1.100 millones en compras con 220 empresas, y Contapilot hace el cruce con ARCA. Es exactamente el producto que uno diseñaría, construido y financiado antes. |
| Asistencia y licencias (RRHH) | ArcanRH, Legajo.ar, FirmaLaboral y Factorial, este último con versión localizada a Argentina. Nada que agregar desde afuera. |
| Presupuestos de oficios | El electricista sufre el problema pero cobra por trabajo y no tiene hábito de abono mensual. Adquisición cara, churn altísimo, ticket de $5.000. Es un producto de amor, no de negocio. |
| Fidelización con sellos | Nadie paga por reemplazar un cartón que cuesta $0. Y el valor —volver a traer al cliente— es difícil de atribuir, así que la renovación se cae al tercer mes. |
| Retenciones y percepciones multi-jurisdicción | Dolor genuino y caro, pero el dominio es brutal: padrones provinciales, regímenes que cambian, y un error tuyo le cuesta plata al cliente. Sin socio contador, un dev solo no debería tocarlo. |
| Vencimientos personales (VTV, seguro, patente) | B2C puro sin dolor económico inmediato. La gente instala la app, recibe dos avisos y la desinstala. No hay con qué monetizar. |
| Compra de auto usado | Frecuencia excepcional: una vez cada varios años. Imposible construir recurrencia; sería un servicio de gestoría con una web adelante. |
| Comunicación interna en WhatsApp | Todo el mundo lo sufre y nadie lo compra. Compite contra un hábito gratis y contra Slack/Teams. El clásico problema que se confunde con oportunidad. |

## Las 10 finalistas, a fondo

En orden de Opportunity Score. Cada ficha responde las mismas preguntas: qué pasa hoy, qué construiría, qué dejaría afuera a propósito, cómo conseguiría los primeros clientes y qué la puede hundir.

### #1 — Las listas de precios que el proveedor manda en PDF

**Opportunity Score: 7,50/10** · 🟢 Solo founder · IA: sí, y necesaria · 🌎 LatAm · Adyacencia media

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 8 | 8 | 8 | 7 | 7 | 7 | 6 | 7 | 8 |

**Problema** — Cada dos o tres semanas el proveedor manda una lista nueva de precios. Viene en PDF o en Excel, con un formato distinto según quién la exportó ese día. Alguien tiene que cargar cientos de artículos a mano en el sistema de gestión.
**Situación concreta** — Una distribuidora con 40 proveedores recibe entre 15 y 25 listas por mes. Un empleado administrativo pierde **media jornada por lista grande**. Mientras tanto, la góndola sigue con el precio viejo y se vende por debajo del costo de reposición.
**Por qué lo actual es malo** — Los ERPs argentinos —Flexxus, Axoft, Contabilium, Fierro— tienen importador, pero todos piden un CSV ya limpio y mapeado. El trabajo sucio de _llegar_ a ese CSV es precisamente lo que nadie automatizó. Y los conversores genéricos de PDF a Excel no conocen el maestro de artículos del cliente, ni el IVA, ni si el precio viene por bulto o por unidad. Lo que se rompe siempre: separador decimal (1.234,56 contra 1,234.56), criterios de IVA distintos entre proveedores, precio por bulto sin aclarar, PDFs escaneados y códigos que no matchean con el maestro.
**Qué software lo resuelve** — Extracción determinística de tablas primero (pdfplumber/openpyxl); IA solo donde aporta: mapear las columnas leyendo las primeras ~15 filas, y hacer matching difuso de descripciones contra el maestro de artículos del cliente. Después, código común aplicando ese mapeo a todas las filas. Encima: reglas de margen y redondeo por rubro, y un **diff obligatorio antes de aplicar** — “estos 12 artículos suben más de 40%, ¿confirmás?”.
**MVP (4 semanas)** — Subir archivo → detección de columnas → mapeo contra el maestro que el cliente sube una vez → previsualización del diff con alertas de variación anómala → exportar el CSV en el formato exacto del ERP del cliente. Nada más.
**Qué NO incluiría** — 
  - Integración bidireccional con ERPs: se negocia después, con clientes en la mano.
  - App móvil.
  - Usuarios, roles y permisos.
  - Publicación automática a e-commerce.
  - Soporte a cualquier formato: arrancá con los 5 proveedores del primer cliente.
**Primeros 10 clientes** — Cold outreach a distribuidoras y mayoristas por rubro (ferretería, farmacia, gastronomía, electricidad) con una oferta concreta: “mandame la última lista que te mandó tu proveedor y te la devuelvo cargada en 2 horas”. Segundo canal, mejor: los propios vendedores de ERPs, que tienen el cliente y no quieren hacer este trabajo — se lo revendés a ellos.
**Cómo cobraría** — Abono mensual por volumen: $45.000 a $150.000/mes según cantidad de listas y artículos. El ancla es clara — reemplaza medio sueldo administrativo. Modelo: SaaS B2B con onboarding pago (mapeo inicial del maestro), que además filtra clientes que no van en serio.
**Competencia** — Dijit.app y Rossum hacen PDF a Excel genérico; Apport lo hace para Shopify. Ninguno resuelve el maestro de artículos ni las reglas de margen argentinas. Los ERPs tienen importadores de CSV, no de PDF sucio. **Es el nicho más despejado que encontré en toda la investigación.**
**Barreras y riesgos** — El riesgo real es el long tail de formatos: el 80% funciona en dos semanas y el 20% restante te come seis meses. Mitigación: no prometas 100% automático. Vendé “cargado y revisado”, con vos en el loop las primeras veces, y cobrá por el resultado. Riesgo secundario: que un ERP lo incorpore como feature — por eso conviene venderles a ellos antes de competirles.
**Techo como empresa** — De “cargar listas” a catálogo maestro de precios por industria, y de ahí a comparación de proveedores y datos de mercado. El problema existe igual en México, Colombia y España: es exportable sin rehacer el producto.

> **Test de honestidad:** ¿ya gastan plata en esto? Sí — le pagan a un administrativo medio día cada quince. ¿Por qué no comprarían? Porque desconfían de que un sistema toque los precios: por eso el diff con confirmación no es un detalle de UX, es el producto.

### #2 — Los débitos de las obras sociales que nadie sale a recuperar

**Opportunity Score: 7,25/10** · 🟡 Moderado · IA: sí, sobre documentos · 🌍 Global (RCM) · Adyacencia nula

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 9 | 8 | 9 | 6 | 8 | 5 | 5 | 5 | 9 |

**Problema** — El prestador factura, la obra social paga menos de lo facturado y devuelve un débito. Recuperarlo exige cruzar a mano la liquidación con la historia clínica, el bono y la autorización, armar el descargo y presentarlo antes del plazo de cada obra social. Muchos prestadores chicos directamente no lo hacen: dan la plata por perdida.
**Situación concreta** — Un centro de kinesiología con cuatro profesionales factura a diez obras sociales. Cada una tiene su nomenclador, su circuito de auditoría y su plazo. Diez circuitos administrativos distintos para una sola administrativa part-time.
**Por qué lo actual es malo** — Se hace en Excel cruzado contra el portal de cada obra social. Es propenso a error, consume horas semanales y genera rechazos caros. Cuando el proceso no está estandarizado aparecen esperas largas, reclamos de pacientes, facturas rechazadas y flujo de caja impredecible. El prestador chico ni siquiera sabe cuánto le debitaron en el año.
**Qué software lo resuelve** — Ingesta de la liquidación de cada obra social (PDF o Excel), normalización contra lo facturado, y detección automática de la diferencia por prestación. IA de verdad acá: leer documentos no estructurados y clasificar el motivo del débito, después sugerir el descargo con la documentación que corresponde adjuntar. Encima, un tablero con lo único que importa: cuánto te debitaron, por qué motivo, cuánto se recuperó y qué está por vencer.
**MVP (4 semanas)** — Una sola obra social, una sola especialidad. Subís la liquidación, el sistema te dice qué prestaciones te debitaron y por cuánto, y te arma la planilla de descargo. Nada de historia clínica ni de turnos.
**Qué NO incluiría** — 
  - Historia clínica y agenda: te convierte en un competidor de software médico completo y perdés.
  - Integración con el portal de cada obra social al inicio: el usuario sube el archivo.
  - Facturación electrónica.
  - Multi-sede.
**Primeros 10 clientes** — Círculos médicos y colegios profesionales de una provincia, que ya dictan capacitaciones de facturación médica. Ofrecer una auditoría gratis de los últimos tres meses de débitos: es un informe con un número de plata perdida al final, y ese número vende solo.
**Cómo cobraría** — Dos opciones y elegiría la segunda para empezar: abono ($80.000-$250.000/mes según volumen), o **success fee del 10-15% sobre lo efectivamente recuperado**. El success fee elimina la objeción de precio y alinea el incentivo, a costa de cobrar más tarde.
**Competencia** — Rexia hace automatización del ciclo de ingresos en salud con IA; AudiRed ofrece auditoría y facturación; MednIA y Salud Digital cubren facturación a obras sociales. El espacio está ocupado arriba, pero el prestador chico —el consultorio de dos personas— sigue sin nada que pueda pagar.
**Barreras y riesgos** — El dominio es la barrera y también el riesgo: nomencladores, circuitos, plazos. Sin alguien que sepa facturación médica al lado, un dev solo se estrella. El otro riesgo es el ciclo de venta: salud desconfía y decide lento. Es la oportunidad de mayor premio y mayor fricción de las diez.
**Techo como empresa** — Muy alto. Revenue cycle management es una categoría enorme y el problema es idéntico en toda LatAm y, con otro vocabulario, en Estados Unidos. Es la única de la lista que podría terminar siendo una empresa grande.

> **Test de honestidad:** ¿ya gastan plata? Sí: contratan facturistas y consultoras de auditoría médica. ¿Por qué no comprarían? Porque el que más lo necesita —el consultorio chico— es el que menos capacidad tiene de cambiar su proceso. Ahí el modelo tiene que ser servicio con software adentro, no software solo.

### #3 — La cobranza B2B que hoy depende de que alguien se acuerde

**Opportunity Score: 7,10/10** · 🟢 Solo founder · IA: opcional · 🌎 LatAm · Adyacencia baja

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 8 | 9 | 8 | 7 | 6 | 5 | 6 | 7 | 7 |

**Problema** — La PyME vende a 30 o 300 clientes con cuenta corriente y el seguimiento de quién debe qué vive en un Excel de vencimientos. Nadie reclama a tiempo, la mora se estira y el capital de trabajo se financia solo con nervios.
**Situación concreta** — La administrativa entra al sistema, filtra vencidos, arma una lista, manda WhatsApps de a uno y anota en una columna “lo llamé el martes”. Cuando se toma vacaciones, la cobranza se detiene.
**Por qué lo actual es malo** — El Excel no sabe si el cliente pagó — eso está en la cuenta bancaria y en Mercado Pago. El reclamo es manual, inconsistente y emocionalmente incómodo, así que se posterga. Y no hay historial: nadie puede decir qué secuencia de reclamos funciona mejor.
**Qué software lo resuelve** — Secuencias automáticas de cobranza: recordatorio antes del vencimiento, aviso el día, escalamiento a los 7, 15 y 30 días, con tono configurable y el link de pago adentro. Conciliación automática contra los cobros reales para frenar el reclamo apenas entra la plata — mandar un reclamo a alguien que ya pagó es peor que no mandar nada. Tablero de DSO y de antigüedad de saldos.
**MVP (4 semanas)** — Importás un CSV de facturas pendientes, definís una secuencia, y el sistema manda mails y WhatsApps con link de pago. Marcado de pago manual, más conciliación automática con Mercado Pago.
**Qué NO incluiría** — 
  - Facturación electrónica: no compitas con TusFacturas.
  - Contabilidad.
  - Integración con todos los ERPs: CSV al principio.
  - Scoring crediticio.
**Primeros 10 clientes** — Distribuidoras y mayoristas del mismo círculo que la oportunidad #1 — de hecho, es el mismo comprador. Cold outreach por LinkedIn al dueño o al gerente administrativo, con una sola pregunta: “¿cuánto tenés vencido a más de 60 días?”. El que sabe el número, sufre; el que no lo sabe, sufre más.
**Cómo cobraría** — Abono por volumen de facturas gestionadas: $50.000-$180.000/mes. Es fácil de justificar contra un punto de mejora en la mora.
**Competencia** — Cobrando.app cubre cuenta corriente y fiado en retail; los ERPs tienen módulo de cuenta corriente pero no secuencias de cobranza; a nivel global, Chaser y Upflow hacen exactamente esto y no están localizados a Argentina. Campo semi-ocupado, con hueco real en la parte de automatización.
**Barreras y riesgos** — WhatsApp es el canal que el cliente quiere y el más difícil de usar bien: la API oficial exige plantillas aprobadas y un proveedor, y los atajos no oficiales te hacen banear el número del cliente. Ese es el riesgo técnico central y hay que resolverlo bien desde el día uno.
**Techo como empresa** — Bueno. De cobranza a financiamiento de facturas es un camino natural y muy monetizable, aunque implica capital y regulación.

> **Test de honestidad:** ¿ya gastan plata? Sí, en horas de personal administrativo. ¿Por qué no comprarían? Porque muchas PyMEs creen que su cobranza “ya funciona”. La venta no es el software, es mostrarles el número de días de mora que hoy no miden.

### #4 — Los que ARCA obligó a facturar el 1 de julio de 2026

**Opportunity Score: 6,90/10** · 🟢 Solo founder · IA: no hace falta · 🇦🇷 Argentina · Adyacencia nula

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 7 | 8 | 6 | 7 | 7 | 6 | 7 | 8 | 6 |

**Problema** — La RG 5824/2026 eliminó exenciones que existían hace décadas. Desde el 1 de julio de 2026 quedaron obligados a emitir comprobante electrónico los directores de sociedades anónimas, los socios gerentes de SRL, los profesionales que cobran honorarios en juicios, y las entidades educativas, de medicina prepaga, aseguradoras y emisoras de tarjetas. Miles de sujetos que nunca facturaron, ahora tienen que hacerlo todos los meses.
**Situación concreta** — Un estudio contable mediano tiene 60 clientes sociedades. De golpe aparecen 90 directores y socios gerentes que necesitan factura mensual por honorarios. El estudio las emite una por una en el portal de ARCA. Es la tarea más aburrida y más repetitiva del mes, y no se puede facturar cara.
**Por qué lo actual es malo** — El portal de ARCA es de a un CUIT por vez, con login por clave fiscal. No hay lotes, no hay “emitir las 90 de este mes”, y cada error se descubre tarde. Además la norma incorporó la liquidación electrónica mensual —un comprobante único por receptor y por mes— que nadie está usando todavía porque los sistemas no la implementaron.
**Qué software lo resuelve** — Un emisor por lote contra los web services de ARCA, multi-CUIT, operado por el estudio en nombre de sus clientes. Plantillas por tipo de sujeto (honorarios de director, honorarios judiciales, arancel educativo), generación mensual recurrente, control de numeración, reintentos cuando ARCA se cae, y entrega del PDF al destinatario final. Acá la IA no aporta nada: lo que aporta es un backend confiable, que es exactamente tu perfil.
**MVP (4 semanas)** — Un solo tipo de comprobante y un solo perfil: honorarios de directores y socios gerentes. Cargás una grilla o un CSV con los CUITs y los importes, emitís el lote, descargás los PDFs. Certificados de ARCA gestionados por el estudio.
**Qué NO incluiría** — 
  - Contabilidad o liquidación de impuestos.
  - Todos los tipos de comprobante.
  - Portal para el cliente final del estudio.
  - Conciliación bancaria.
**Primeros 10 clientes** — Los consejos profesionales de ciencias económicas y sus grupos, más LinkedIn: los contadores argentinos son activos ahí y se quejan en público de la carga operativa de cada resolución nueva. Un contenido corto y útil —“cómo emitir las facturas de directores en lote”— trae reuniones sin presupuesto de publicidad.
**Cómo cobraría** — Por CUIT gestionado: $2.500-$4.000 por CUIT por mes, facturado al estudio, no al director. Un estudio con 90 CUITs deja $270.000/mes. El ancla existe: Facturitas cobra $4.999/mes por facturación ilimitada por WhatsApp a un monotributista.
**Competencia** — TusFacturas, Facturante, Contabilium y Xubio emiten comprobantes electrónicos y algunos tienen API. Facturitas domina el ángulo monotributista por WhatsApp. Lo que nadie armó es el flujo específico del estudio que emite en lote por decenas de terceros para este régimen nuevo. Es una ventana, y las ventanas se cierran.
**Barreras y riesgos** — Riesgo alto de ventana temporal: si TusFacturas saca el lote multi-CUIT bien hecho, se terminó. Riesgo regulatorio invertido: la norma podría prorrogarse o flexibilizarse y evaporar la urgencia. Y el manejo de certificados y claves fiscales de terceros implica una responsabilidad de seguridad que hay que tomarse en serio —cifrado en reposo, cero secretos en logs—, disciplina que ya aplicás en Opinara.
**Techo como empresa** — Limitado y muy argentino: es un micro-SaaS de $5 a $15 millones mensuales, no una empresa grande. Pero es el de validación más rápida de los diez y el que mejor calza con tus manos.

> **Test de honestidad:** ¿ya gastan plata? Sí, en horas de un junior del estudio. ¿Por qué no comprarían? Porque el estudio ya paga un sistema que “casi” lo hace, y sumar una herramienta más tiene costo de coordinación. La venta entra por el ahorro de horas en un mes concreto, no por features.

### #5 — El turno que no vino y no se puede recuperar

**Opportunity Score: 6,70/10** · 🟢 Solo founder · IA: no · 🌎 LatAm · Adyacencia media

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 7 | 9 | 7 | 8 | 5 | 3 | 6 | 8 | 6 |

**Problema** — El ausentismo sin costo. El paciente o cliente reserva, no avisa y no viene. Ese bloque de agenda no se recupera, y el profesional que cobra por hora perdió ingreso real.
**Situación concreta** — Una consultora de estética con tres cabinas tiene entre 15% y 25% de no-show los lunes. La recepcionista manda recordatorios a mano por WhatsApp la tarde anterior, cuando se acuerda.
**Por qué lo actual es malo** — Las agendas existentes resuelven el calendario, no el incentivo. Mientras reservar sea gratis, el no-show sigue siendo gratis. El recordatorio manual ayuda algo, pero depende de una persona y no escala.
**Qué software lo resuelve** — Agenda con **seña obligatoria al reservar**, cobrada con Mercado Pago y descontada del total, más política de cancelación automática y recordatorios por WhatsApp. El producto no es la agenda: es el cambio de incentivo con el cobro adentro.
**MVP (4 semanas)** — Link público de reserva, cobro de seña vía Mercado Pago, confirmación y recordatorio, panel con la agenda del día. Un profesional por cuenta.
**Qué NO incluiría** — 
  - Historia clínica.
  - Facturación.
  - Multi-sucursal y gestión de equipos.
  - App nativa: link y QR alcanzan.
**Primeros 10 clientes** — Visita presencial a centros de estética, kinesiología y odontología de una zona, con una pregunta concreta: “¿cuántos turnos se te cayeron esta semana?”. Instagram funciona bien en estética y es un canal barato de prospección.
**Cómo cobraría** — Abono bajo ($15.000-$35.000/mes) más comisión sobre la seña cobrada, o solo comisión. La comisión sobre seña alinea el precio con el valor y elimina la fricción de entrada.
**Competencia** — **Muy dura.** AgendaPro, Reservo, Doctoralia, Turnos.io, Bookeo y Fresha —esta última con modelo gratuito— ya compiten. Le puse 3 sobre 10 en competencia favorable y es la nota más baja de las diez fichas. Solo entra en la lista por la frecuencia diaria y porque el ángulo de la seña sigue mal resuelto en el segmento chico.
**Barreras y riesgos** — El riesgo principal es que la seña sea culturalmente resistida: muchos profesionales creen que pedirla les espanta clientes. Si esa objeción no se puede vencer con datos, el producto no tiene diferencial y quedás compitiendo contra un gratuito.
**Techo como empresa** — Medio. Es un mercado grande y repetible en LatAm, pero con precio bajo y competencia establecida.

> **Test de honestidad:** ¿lo sufren lo suficiente para pagar? Sí. ¿Pagarían _a vos_ existiendo Fresha gratis? Solo si el cobro de seña les devuelve plata medible en el primer mes. Si en las entrevistas la mayoría dice “no puedo pedir seña”, descartá esta idea sin dudar.

### #6 — ¿Entró la plata? El cierre de caja de todos los días

**Opportunity Score: 6,65/10** · 🟢 Solo founder · IA: no · 🌎 LatAm · Adyacencia media

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 7 | 9 | 6 | 8 | 5 | 5 | 6 | 7 | 6 |

**Problema** — Dos problemas hermanos. Uno: cerrar el día cruzando ventas contra Mercado Pago, transferencias, efectivo y tarjetas, donde lo acreditado nunca coincide con lo vendido por comisiones, cargos y retenciones. Dos: el comprobante de transferencia falso que el cliente muestra en el mostrador y que el comercio acepta sin verificar.
**Situación concreta** — El dueño cierra a las 21 y compara la app de Mercado Pago con la planilla del día. Si no da, revisa movimiento por movimiento buscando una comisión no cargada, un pago duplicado o un error de tipeo. Media hora, todos los días.
**Por qué lo actual es malo** — La conciliación exige partir de la venta bruta, restar comisión, cargo financiero y envío, identificar retenciones y percepciones, y que el resultado iguale el neto acreditado. Hacerlo a mano en una planilla es tedioso y se abandona a la semana. Y la verificación de transferencias hoy es visual: mirar una captura de pantalla que cualquiera puede falsificar.
**Qué software lo resuelve** — Conexión directa a la API de Mercado Pago con webhooks, para tener el cobro real en el momento en que ocurre. Verificación instantánea en el mostrador: el cajero ve en pantalla si el dinero entró, sin mirar la captura del cliente. Y cierre de caja automático que explica la diferencia entre bruto y neto en vez de solo mostrarla.
**MVP (4 semanas)** — Conectás la cuenta de Mercado Pago, ves los cobros en vivo, marcás el cierre del día y el sistema arma el cuadro de conciliación con comisiones y retenciones discriminadas.
**Qué NO incluiría** — 
  - Punto de venta completo.
  - Stock.
  - Facturación.
  - Integración con bancos: arrancá solo con Mercado Pago.
**Primeros 10 clientes** — Recorrida a pie por comercios de una avenida comercial. Es el mismo canal que Opinara, y esa es toda su ventaja de adyacencia: podés testear dos productos en la misma visita.
**Cómo cobraría** — Abono chico: $12.000-$30.000/mes. Es un mercado de volumen y precio bajo.
**Competencia** — PagaVoz ya hace cobros y conciliación por voz para Mercado Pago; los ERPs de comercio incluyen cierre de caja. **Y el competidor peligroso es el propio Mercado Pago**, que puede resolverlo nativamente en cualquier release.
**Barreras y riesgos** — Dependencia total de plataforma: tu producto vive de una API que no controlás y compite con su dueño. Es el riesgo más serio de las diez fichas, y no tiene mitigación buena más allá de abrir a otros medios de pago rápido.
**Techo como empresa** — Bajo como producto suelto; razonable como puerta de entrada a un producto más grande de administración de comercio.

> **Test de honestidad:** ¿por qué no comprarían? Porque el dueño ya “se arregla” y porque cualquier mejora que Mercado Pago publique lo deja sin necesidad. Buen problema, plataforma peligrosa.

### #7 — La carpeta de papeles que habilita a un contratista a entrar a la planta

**Opportunity Score: 6,55/10** · 🟡 Moderado · IA: sí, para leer documentos · 🌎 LatAm · Adyacencia nula

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 7 | 7 | 7 | 5 | 8 | 6 | 4 | 7 | 7 |

**Problema** — Una empresa que contrata terceros —construcción, industria, logística, shoppings, countries— debe verificar mes a mes que cada contratista tenga F.931 presentado, ART vigente con nómina, seguro de vida obligatorio, constancia de CUIT y póliza de responsabilidad civil. Si no lo hace y pasa algo, responde solidariamente.
**Situación concreta** — El responsable de compras o de seguridad e higiene persigue por mail a 40 contratistas todos los meses, recibe PDFs, los mira por arriba, los guarda en una carpeta compartida y anota en un Excel quién está al día. Nadie audita ese Excel hasta que hay un accidente o una inspección.
**Por qué lo actual es malo** — Es verificación por buena fe: nadie lee 40 F.931 en detalle para comprobar que el empleado que hoy entra a la obra figure en la nómina declarada. El Excel dice “ok” y el ok no significa nada.
**Qué software lo resuelve** — Portal donde cada contratista sube su documentación, con lectura automática de los PDFs para extraer período, CUIT, vigencia y nómina, y validación contra reglas —vencido, empleado no declarado, póliza sin endoso—. Semáforo por contratista, recordatorio automático de vencimiento, y bloqueo del ingreso cuando falta algo. Acá la IA hace lo que hoy hace una persona leyendo papeles.
**MVP (4 semanas)** — Portal de carga por contratista, extracción de vigencia y fechas de tres tipos de documento (ART, F.931, seguro de vida), semáforo y aviso automático a los que están por vencer.
**Qué NO incluiría** — 
  - Control de acceso físico con molinetes: viene después y es hardware.
  - Gestión de obra y avance.
  - Firma digital.
  - Integración con ARCA al inicio.
**Primeros 10 clientes** — El comprador es el responsable de seguridad e higiene o el de compras. Se los encuentra en LinkedIn y en cámaras sectoriales. Ciclo de venta largo, pero el presupuesto existe y está asignado a compliance.
**Cómo cobraría** — Por contratista gestionado: $8.000-$15.000 por contratista por mes, pagado por la empresa principal. Cincuenta contratistas son $400.000-$750.000 mensuales de un solo cliente. Es el mejor ticket unitario de la lista.
**Competencia** — Hay soluciones regionales de gestión de contratistas y algunos módulos dentro de software de seguridad e higiene, pero no encontré un producto argentino dominante con precio público. Evidencia parcial: no confirmé el mapa competitivo completo, y es lo primero que verificaría.
**Barreras y riesgos** — La adquisición es el cuello de botella: 4 sobre 10. Vender compliance a una empresa mediana sin referencias previas ni credibilidad sectorial es lento y frustrante para alguien solo. El riesgo de producto es bajo; el riesgo comercial es alto.
**Techo como empresa** — Bueno. Se expande naturalmente a control de accesos, inducciones de seguridad y auditoría, y el problema es idéntico en Chile, Perú y México.

> **Test de honestidad:** ¿el dolor es real o latente? Es latente hasta que hay una inspección o un accidente, y ese es el punto débil. La venta funciona si entrás después de un susto, no antes.

### #8 — La ficha de Google que nadie mira y las reseñas sin responder

**Opportunity Score: 6,35/10** · 🟢 Solo founder · IA: sí, para respuestas · 🌍 Global · Adyacencia alta

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 5 | 6 | 6 | 8 | 5 | 4 | 6 | 9 | 7 |

**Problema** — El comercio vive de aparecer en el mapa y no gestiona su presencia: horarios desactualizados, categoría mal elegida, sin fotos nuevas, reseñas negativas sin responder durante meses. Para una cadena con 30 sucursales, el problema se multiplica por 30 y se vuelve inmanejable a mano.
**Situación concreta** — Una cadena de gastronomía con 18 locales: cada encargado tiene acceso a su ficha, nadie controla nada, y tres locales figuran abiertos un feriado en que cerraron. Las reseñas las contesta el dueño desde el celular cuando se acuerda.
**Por qué lo actual es malo** — Google no da una vista consolidada útil para operar varias sucursales ni un flujo de trabajo con responsables y estados. Las agencias lo hacen a mano y cobran por hora. Y lo que sí resuelve gratis —generar reseñas— ya viene incluido.
**Qué software lo resuelve** — Consola multi-sucursal sobre la API de Google Business Profile: sincronización de reseñas, bandeja de respuestas con borradores generados por IA y aprobación humana, alertas de reseña negativa, control de consistencia de datos entre sucursales, y publicación de posts y fotos en lote. Es casi exactamente lo que ya tenés construido: multi-tenant por negocio, OAuth de Google, importación de locations, sync incremental con cron y backoff, y respuestas contra la API oficial.
**MVP (4 semanas)** — Tu Fase 6 más una bandeja de respuestas con sugerencia de IA y un panel de salud por sucursal. El 70% del backend ya existe.
**Qué NO incluiría** — 
  - Publicación en redes sociales.
  - Analítica de competidores.
  - Encuestas NPS elaboradas.
  - Más plataformas (Apple Maps, TripAdvisor) hasta tener clientes pidiéndolas.
**Primeros 10 clientes** — Agencias de marketing local como canal de reventa: ellas ya cobran por hacerlo a mano y tu herramienta les mejora el margen. Directo al comercio chico, el canal es caro y el ticket bajo.
**Cómo cobraría** — Por sucursal: $10.000-$20.000 por sucursal por mes, con mínimo mensual. Una cadena de 18 locales deja $180.000-$360.000. El comercio de una sola sucursal no es el cliente; la cadena sí.
**Competencia** — **Dura y global:** Birdeye, Podium, Uberall y Localo hacen esto con equipos grandes. Y Google regala el link y el QR de reseñas desde su propio panel, además de vendedores argentinos que ofrecen la placa QR como producto suelto. El QR no es defendible.
**Barreras y riesgos** — Dependencia total de la API de Google, con sus cuotas y sus cambios de política. Y el riesgo de posicionamiento: si el producto se vende como “generá más reseñas”, compite contra algo gratis. Si se vende como “operá 20 sucursales sin volverte loco”, compite contra agencias caras. La segunda venta es la que vale.
**Techo como empresa** — Medio-alto, pero solo si se enfoca en multi-sucursal desde el principio. Como herramienta para un comercio suelto, el techo es bajo.

> **Test de honestidad:** esta es la nota más cruda del informe. El score es 6,35 _con_ el bonus máximo de adyacencia; sin él baja a 6,05 y queda anteúltima. Está en el Top 10 porque ya tenés el motor construido, no porque sea el mejor mercado. Si el objetivo es el mejor negocio, no es esta; si el objetivo es capitalizar lo ya hecho, tiene sentido terminarla y venderla a cadenas, no a comercios sueltos.

### #9 — Los vencimientos que solo se descubren con la multa

**Opportunity Score: 6,30/10** · 🟢 Solo founder · IA: marginal · 🌎 LatAm · Adyacencia nula

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 6 | 5 | 7 | 7 | 5 | 7 | 5 | 9 | 6 |

**Problema** — Toda organización con instalaciones arrastra un calendario de vencimientos que nadie posee: matafuegos, ascensores cada seis meses, habilitación municipal, verificación de fachadas, instalación de gas y eléctrica, pólizas, VTV de la flota, libretas sanitarias. Se descubre que algo venció cuando llega la inspección.
**Situación concreta** — Un administrador con 14 edificios sostiene ese calendario en la cabeza y en mails del proveedor. Las multas por incumplimiento en propiedad horizontal van de $500.000 a $10.000.000 según la infracción, y mantener las certificaciones vigentes es obligación indelegable del administrador.
**Por qué lo actual es malo** — Un Google Calendar no sabe que el certificado de ascensores vence cada seis meses ni qué documento hay que tener colgado en la sala de máquinas. Y no guarda el papel: cuando viene el inspector, hay que salir a buscarlo.
**Qué software lo resuelve** — Catálogo de obligaciones precargado por tipo de instalación y jurisdicción, con la periodicidad y el documento requerido ya definidos —ese catálogo es el producto, no el recordatorio—. Carga del certificado con lectura de la fecha de vencimiento, alertas escalonadas, responsable asignado y carpeta lista para mostrar en una inspección.
**MVP (4 semanas)** — Una jurisdicción (CABA) y un tipo de sujeto (consorcio o local gastronómico). Catálogo precargado, carga de certificados, alertas a 60, 30 y 7 días, y un PDF con el estado de cumplimiento.
**Qué NO incluiría** — 
  - Expensas y liquidaciones: ahí perdés contra CONSO.
  - Presupuestos y proveedores.
  - Todas las jurisdicciones del país.
  - Firma digital.
**Primeros 10 clientes** — Administradores chicos, de 5 a 20 edificios, vía cámaras del sector; y estudios de seguridad e higiene, que pueden revenderlo a su cartera.
**Cómo cobraría** — Por edificio o por establecimiento: $6.000-$12.000 mensuales. Es un precio bajo por diseño: hay que compensarlo con volumen o con un partner que revenda.
**Competencia** — Favorable —7 sobre 10—: no encontré un producto argentino independiente dedicado a esto. Las plataformas de consorcios lo incluyen como módulo secundario, lo que deja libre el segmento que no usa esas plataformas.
**Barreras y riesgos** — El dolor es latente: nadie compra un seguro contra algo que todavía no pasó. Es el motivo de su nota baja en disposición a pagar, y el motivo por el que no la elegiría como primer producto. Riesgo adicional: mantener el catálogo normativo actualizado es trabajo perpetuo.
**Techo como empresa** — Medio. Crece sumando jurisdicciones y tipos de sujeto, pero el precio unitario limita.

> **Test de honestidad:** ¿lo sufren lo suficiente para pagar hoy? Honestamente, no: lo sufren después. Es una buena segunda línea de producto para vender a una base que ya te compró otra cosa, no un producto de arranque en frío.

### #10 — Las fotos de tickets que llegan por WhatsApp a fin de mes

**Opportunity Score: 5,90/10** · 🟢 Solo founder · IA: sí, OCR y clasificación · 🌍 Global · Adyacencia nula

| Dolor | Frecuencia | Impacto económico | Usuarios potenciales | Disposición a pagar | Competencia favorable | Facilidad de adquisición | Facilidad de MVP | Potencial de expansión |
|---|---|---|---|---|---|---|---|---|
| 6 | 7 | 5 | 6 | 6 | 4 | 5 | 8 | 7 |

**Problema** — Los empleados que gastan en la calle —técnicos, vendedores, obra— mandan fotos de tickets por WhatsApp o las acumulan en la billetera. A fin de mes alguien arma un Excel, pega los importes, pide los que faltan y reembolsa tarde.
**Situación concreta** — Una empresa de servicios con 12 técnicos en la calle. Nafta, peajes, repuestos de urgencia, almuerzos. La administrativa dedica dos días del cierre a perseguir comprobantes, y varios se pierden, así que el IVA no se computa.
**Por qué lo actual es malo** — El comprobante en papel se pierde, la foto por WhatsApp se entierra en el chat, y el Excel no valida nada: no sabe si el CUIT es válido, si el gasto está dentro de la política, ni si ese ticket ya se cargó dos veces.
**Qué software lo resuelve** — El empleado le manda la foto a un número de WhatsApp y listo. Del otro lado, extracción de comercio, CUIT, fecha, importe e IVA; clasificación por categoría; detección de duplicados; validación contra política de gastos; y una exportación lista para el sistema contable. La IA hace exactamente lo que hoy hace una persona transcribiendo.
**MVP (4 semanas)** — Bot de WhatsApp que recibe la foto, extrae los datos, responde con el resumen para que el empleado confirme, y un panel donde el administrador aprueba y exporta a CSV.
**Qué NO incluiría** — 
  - Tarjetas corporativas propias: eso es fintech y regulación.
  - Reembolso automático de dinero.
  - Integración contable profunda.
  - App móvil: WhatsApp es la app.
**Primeros 10 clientes** — Empresas de servicio técnico, instalaciones y logística con gente en la calle. LinkedIn y cámaras sectoriales.
**Cómo cobraría** — Por empleado activo: $6.000-$10.000 por persona por mes. Doce técnicos son $72.000-$120.000 mensuales.
**Competencia** — Expensify y Rippling dominan afuera; en Argentina, Fex ya hace lectura de comprobantes con IA para empresas medianas y podría bajar a este caso de uso sin esfuerzo. Nota de competencia baja: 4 sobre 10.
**Barreras y riesgos** — Poca defensibilidad: la extracción de datos de un ticket es hoy una llamada a un modelo, y eso lo puede hacer cualquiera. El valor tendría que estar en la política de gastos y en la integración contable, que es justo la parte que más cuesta vender.
**Techo como empresa** — Medio, y el camino natural —tarjetas y adelantos— requiere capital y licencias que un dev solo no tiene.

> **Test de honestidad:** es la más débil de las diez y por eso está última. El dolor es real pero moderado, la barrera técnica es casi nula y hay jugadores con más músculo. La incluyo porque es la mejor de la categoría “aburrida y automatizable”, no porque la recomiende.

## Ranking final

Las columnas son las notas crudas sobre 10; el Score es el promedio ponderado más el ajuste de adyacencia. Nada redondeado a favor.

| # | Problema | Usuario | Dolor | Pagan | MVP | Mercado | Compet. | Solo founder | Score |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Listas de precios de proveedores | Distribuidoras, mayoristas, ferreterías | 8 | 7 | 7 | 7 | 7 | 🟢 | **7,50** |
| 02 | Recupero de débitos de obras sociales | Prestadores de salud chicos y medianos | 9 | 8 | 5 | 6 | 5 | 🟡 | **7,25** |
| 03 | Cobranza B2B automatizada | PyMEs que venden a crédito | 8 | 6 | 7 | 7 | 5 | 🟢 | **7,10** |
| 04 | Nuevos obligados a facturar (RG 5824) | Estudios contables y sus clientes | 7 | 7 | 8 | 7 | 6 | 🟢 | **6,90** |
| 05 | Turnos con seña contra el ausentismo | Salud, estética, oficios | 7 | 5 | 8 | 8 | 3 | 🟢 | **6,70** |
| 06 | Verificación y conciliación de cobros | Comercios con mostrador | 7 | 5 | 7 | 8 | 5 | 🟢 | **6,65** |
| 07 | Documentación de contratistas | Industria, construcción, logística | 7 | 8 | 7 | 5 | 6 | 🟡 | **6,55** |
| 08 | Presencia en Google multi-sucursal | Cadenas y agencias de marketing local | 5 | 5 | 9 | 8 | 4 | 🟢 | **6,35** |
| 09 | Vencimientos y compliance edilicio | PyMEs, consorcios, flotas | 6 | 5 | 9 | 7 | 7 | 🟢 | **6,30** |
| 10 | Rendición de gastos por WhatsApp | PyMEs con personal en la calle | 6 | 6 | 8 | 6 | 4 | 🟢 | **5,90** |

**Lectura rápida del ranking.** Ninguna llega a 8. Eso es información, no modestia: en 2026 no encontré en Argentina un problema grande, caro, frecuente y sin competencia. Los que quedan libres son estrechos, y los que son grandes ya tienen dueño. La estrategia correcta para una persona sola es entrar por un hueco angosto con un cliente que paga, no buscar el mercado enorme desatendido — no existe.

## Las 3 que atacaría

No son las tres de mayor score. Son las tres que combinan un problema fuerte con clientes a los que un desarrollador solo, sin red previa y sin capital, puede efectivamente llegar.

### Listas de precios de proveedores

“Yo construiría esto porque es el único nicho de toda la investigación donde encontré el dolor descrito por un tercero, con tiempo medido —media jornada cada dos semanas—, y no encontré ningún producto argentino que lo resuelva. El comprador es una empresa que ya paga a alguien para hacerlo a mano, así que el presupuesto existe y solo cambia de destino. La IA hace acá algo que sin ella requiere una persona, que es la única razón válida para usarla. Y el mismo producto funciona en México o España sin rehacerlo.”

### Facturación en lote para los nuevos obligados de la RG 5824

“Yo construiría esto porque es la validación más barata y más rápida que existe en la lista: el obligado tiene nombre, fecha y multa. Es backend puro contra los web services de ARCA, que es literalmente lo que ya hacés todos los días. El canal —estudios contables— es alcanzable sin conocer a nadie, porque los contadores argentinos viven en LinkedIn y en los consejos profesionales. Asumo el techo: es un micro-SaaS argentino de unos pocos millones por mes, no una empresa grande. A cambio, es la que puede estar facturando primero.”

### Cobranza B2B automatizada

“Yo construiría esto tercero, y a propósito no primero: el comprador es exactamente el mismo que el de las listas de precios —la distribuidora, el mayorista—. Cada llamada de venta sirve para dos productos y cada cliente ganado abre la puerta al segundo. Para alguien solo, el canal es el activo más caro de construir; duplicar su rendimiento vale más que elegir una idea con medio punto más de score.”

**Por qué no elijo la número 2**

El recupero de débitos de obras sociales tiene el premio más grande de todo el informe: el impacto económico más alto, la mejor disposición a pagar y el único techo verdaderamente global. No la elijo por dos razones concretas y no por falta de ambición. Primero, el dominio —nomencladores, circuitos de auditoría y plazos distintos por obra social— exige un socio que facture a obras sociales todos los días; sin eso, un dev solo construye algo que no sirve. Segundo, la adquisición es la peor de la lista: salud decide lento y compra por referencia. **Es la idea a la que volvería con un socio del rubro o después de tener ingresos.** Si conseguís ese socio, salteá todo lo demás y andá a esta.

## Cómo saber en 7 días si vale la pena

Plan para la apuesta principal, con el test de la apuesta rápida corriendo en paralelo desde el día 5. Sin escribir producto. Cada día tiene su criterio de abandono escrito de antemano, que es la única forma de que un criterio de abandono sirva para algo.

- Día 1 Armar la lista, no el producto Cuarenta distribuidoras y mayoristas con teléfono, sacadas de Google Maps por rubro: ferretería, farmacia, insumos gastronómicos, materiales eléctricos, librería mayorista. Y un guion de tres preguntas que no menciona software en ningún momento.
- Día 2 Quince llamadas frías Una sola pregunta decide todo: “¿cada cuánto te manda la lista de precios tu proveedor, y quién la carga al sistema?”. Después, el pedido concreto: “¿me pasás por WhatsApp la última que te llegó?”. Que manden el archivo es la señal, no que digan que sufren. Abandonar si: menos de 5 de 15 describen carga manual y menos de 3 mandan el archivo.
- Día 3 Hacerlo a mano, como concierge Procesar esas listas sin escribir una línea de producto: a mano, con scripts sueltos, con lo que sea. Devolver el CSV cargado y limpio en menos de dos horas. Medir cuánto tardaste vos y anotar qué se rompió —decimales, IVA, precio por bulto, códigos que no matchean—. Eso es la especificación real del producto.
- Día 4 Preguntar el precio con el trabajo ya entregado Reunión de 15 minutos con cada uno que recibió su CSV. La pregunta no es “¿lo usarías?” sino “si te lo devuelvo así cada vez que te llega una lista, ¿cuánto vale por mes?”. Anotar el número que dicen ellos, no proponer uno. Abandonar si: el número promedio es menor a $30.000/mes. A ese precio no cierra para una persona.
- Día 5 Abrir el test paralelo con contadores Un posteo en LinkedIn sobre emisión en lote para directores y socios gerentes bajo la RG 5824, más 20 mensajes directos a contadores con una sola pregunta: “¿cuántos CUITs nuevos tuviste que empezar a facturar desde julio y cómo los emitís?”. Landing de una pantalla con un único botón.
- Día 6 Intentar cobrar de verdad A los tres más entusiastas: “te proceso las próximas cuatro listas de este mes por $X, te lo cobro ahora”. Link de pago o transferencia. Una sola venta manual real vale más que treinta entrevistas amables, porque es la única pregunta que la gente no contesta por cortesía. Abandonar si: cero de tres paga por adelantado y ninguno da una fecha concreta.
- Día 7 Decidir con los números anotados Construir si se cumplen las tres: al menos 8 de 15 describieron el problema sin que se los sugirieras, al menos un pago real o un compromiso con fecha, y un precio promedio mencionado por encima de $30.000. Si se cumplen dos de tres, repetir la semana con otro rubro antes de escribir código. Si se cumple una o ninguna, pasar a la apuesta rápida con el mismo método.

**Lo que este plan evita**

Construir cuatro semanas para descubrir que el problema existe pero nadie lo paga. Las tres señales que busca —describen el dolor sin ayuda, mandan el archivo, pagan por adelantado— son las únicas tres que no se pueden fingir por cortesía en una entrevista.

## Fuentes

Todo lo marcado ✔ sale de acá. Lo que no figura en esta lista es criterio mío y está marcado ○ en el mapa. Nota metodológica: Reddit y los buscadores alternativos estaban bloqueados desde el entorno de esta investigación, así que la evidencia de demanda se apoya en productos y precios publicados, normativa y notas de prensa, no en posteos de foros.

- Terrones, G. — [“Automatizar listas de precios: lo que se rompe cuando el proveedor cambia el Excel”](https://dev.to/gonzalo_terrones_7737b137/automatizar-listas-de-precios-lo-que-se-rompe-cuando-el-proveedor-cambia-el-excel-596i), dev.to
- EY Argentina — [Resolución General (ARCA) 5824](https://www.ey.com/es_ar/technical/tax/tax-alerts-argentina/rg-arca-5824-facturacion-directorio-sa-gerencia-srl)
- Ámbito — [“ARCA amplía la factura electrónica: quiénes deberán emitir comprobantes desde julio de 2026”](https://www.ambito.com/informacion-general/arca-amplia-la-factura-electronica-quienes-deberan-emitir-comprobantes-julio-2026-n6248554)
- CPCE Formosa — [“Nueva Resolución General 5824/2026: cambios en el régimen de facturación”](https://cpcef.org.ar/nueva-resolucion-de-arca-cambios-clave-en-facturacion/)
- CuotaQ — [Facturación electrónica para colegios privados, RG 5824](https://www.cuotaq.com/blog/facturacion-electronica-para-colegios-privados-en-argentina-guia-completa-rg-5824-2026)
- Infobae — [Facturitas, facturación por WhatsApp](https://www.infobae.com/inhouse/2025/03/26/monotributistas-cual-es-la-herramienta-digital-que-permite-generar-facturas-por-whatsapp/) · [facturitas.app](https://www.facturitas.app/) (plan Monotributo $4.999/mes)
- Revista Mercado — [“Fex automatiza la carga de comprobantes con IA y supera los 220 clientes”](https://mercado.com.ar/innovacion/fex-automatiza-la-carga-de-comprobantes-con-ia-y-supera-los-220-clientes)
- [Contapilot](https://contapilot.com.ar/) — agentes de IA para estudios contables
- Asert — [“¿Por qué Mercado Pago acredita menos?”](https://asert.ar/articulos/neto-cobrado-mercado-pago-comisiones-retenciones-conciliacion/) · Kharyo — [MP para PyMEs: CVU, transferencias y conciliación](https://kharyo.com/blog/argentina-mercadopago-transferencias-pyme)
- El Cronista — [“El error más común al pagar o cobrar por transferencia”](https://www.cronista.com/finanzas-mercados/el-error-mas-comun-al-pagar-o-cobrar-por-transferencia-en-ferias-y-emprendimientos/) · [PagaVoz](https://pagavoz.app/)
- [CONSO](https://conso.com.ar/software-administracion-de-edificios) — $2.950 por unidad funcional/mes; liquidación de 8-16 h a 30-90 min
- Estudio Ramos — [Certificaciones edilicias obligatorias en CABA](https://www.ramosestudio.com.ar/blog/certificaciones-edilicias-obligatorias-caba/) (multas de $500.000 a $10.000.000)
- Inmobiliarias: [Rentaloop](https://rentaloop.com.ar/), [Barreeo](https://barreeo.com/), [TusAlquileres](https://tusalquileres.com.ar/), [Inmosoft](https://www.inmosoft.com.ar/), [Rents](https://rents.ar/) · rango $15.000-$80.000/mes
- Legaltech: [MetaJurídico](https://metajuridico.com/) (desde $11.999/mes), [RivoLegal](https://rivolegal.com/) ($49.000 / $149.000 / $399.000), [Veredicta](https://veredicta.com.ar/)
- Salud: [Rexia](https://rexia.ar/), [AudiRed](https://www.audired.com.ar/), [MednIA](https://mednia.com.ar/facturacion-obras-sociales), [Medilink](https://www.softwaremedilink.com/blog/gestion-obras-sociales)
- Gimnasios: [CLUBIO](https://www.clubio.com.ar/), [GymSmartAccess](https://gymsmartaccess.com/blog/como-reducir-la-morosidad-en-gimnasios-con-debito-automatico-y-mercado-pago-en-argentina) (morosidad del 20% al 5%)
- RRHH: [ArcanRH](https://arcanrh.com.ar/), [Legajo.ar](https://www.legajo.net.ar/), [FirmaLaboral](https://firmalaboral.org/modulos/licencias/index.html)
- Fiado: [Cobrando.app](https://cobrando.app/glosario/fiado), [GranLoop](https://granloop.com/blog/fiado-en-almacenes)
- Gastronomía: [bcnsoft — food cost](https://bcnsoft.com.ar/blog/food-cost-gastronomia-guia-completa/) (proteínas rojas +8-12% mensual)
- Talleres: [ComparaSoftware](https://www.comparasoftware.com.ar/taller-mecanico), [TallerTrack](https://www.tallertrack.com.ar/), [TallerPro](https://tallerpro.com.ar/)
- Reseñas: [Google — crear un enlace o QR para pedir reseñas](https://support.google.com/business/answer/16816815?hl=es) (nativo y gratuito) · [linktag.com.ar](https://linktag.com.ar/producto/qr-para-opiniones-de-google/)
- Mercado Libre: [GoBots](https://gobots.ai/ar/blog/responder-preguntas-en-mercado-libre-con-ia/), [Fleeto](https://www.fleeto.com.ar/blog/tiempo-respondiendo-preguntas-mercadolibre-automatizacion)
- Precios: [Flexxus](https://flexxus.com.ar/tag/actualizacion-de-precios/), [Axoft](https://www.axoft.com/img/asistencia/compras/Compras_Administrador-de-Precios_Actualizacion-Manual.pdf), [Contabilium](https://ayuda.contabilium.com/hc/es/articles/360013089713--C%C3%B3mo-actualizo-mis-precios-de-forma-masiva)

---

Versión navegable: https://claude.ai/code/artifact/528d12e2-208c-4776-96a2-97ad57cdfc50
