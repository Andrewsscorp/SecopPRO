# INFORME DE AUDITORÍA FORENSE DE CONTRATACIÓN PÚBLICA

## 1. Panorama General

El análisis forense realizado sobre la muestra de veintiún (21) procesos de contratación pública registrados en la plataforma SECOP revela un volumen total contratado de **$4.501.213.612,12 COP**. 

La distribución institucional muestra una marcada hegemonía de la **Gobernación de Boyacá**, la cual concentra 19 de los 21 procesos evaluados, representando el **98,78% ($4.446.187.446,12 COP)** del presupuesto auditado. Los procesos restantes corresponden a la Alcaldía Municipal de Susacón (Boyacá) con $48.961.900 COP (1,09%) y a la Subred Integrada de Servicios de Salud Sur Occidente ESE con $6.064.266 COP (0,13%).

En relación con las modalidades de selección:
* **Mínima Cuantía:** Domina en frecuencia operativa con catorce (14) procesos (66,6% del total de registros), pero solo representa el 22,2% del monto global ($999.551.413,25 COP).
* **Selección Abreviada (Subasta Inversa y Menor Cuantía):** Representa solo cuatro (4) procesos, pero captura la mayor parte del capital asignado, sumando **$3.303.442.531,87 COP (73,39% del presupuesto)**.
* **Contratación Régimen Especial y Otros:** Representan el porcentaje residual.

---

## 2. Hallazgos de Riesgo (Alertas Rojas)

De la revisión detallada de las fechas, estados, formalización de actos administrativos e imputación presupuestal, se detectan serias vulneraciones a los principios de planeación, legalidad y transparencia (Ley 80 de 1993 y Ley 1150 de 2007):

### A. Ejecución de Contrato Anulado y Sin Firma Legal
* **Proceso ANULADO - Subred Integrada Sur Occidente ESE:** Presenta un valor de $6.064.266 COP a favor del contratista Víctor Raúl Romero González, con fechas de ejecución reportadas entre el `2020-02-01` y `2020-04-30`, pero con el campo de `fecha_de_firma` registrado como *"vacía por el momento"*. 
* *Implicación Forense:* La ejecución de prestaciones contractuales sin la suscripción formal del contrato perfeccionado constituye una presunta vía de hecho administrativa y una violación a las exigencias de perfeccionamiento y ejecución contractual del Estatuto General de Contratación.

### B. Ausencia de Fecha de Inicio en Contrato Adjudicado
* **Proceso CO1.PCCNTR.9500353/2416 (Gobernación de Boyacá):** Suscrito con SINCRONIA SAS por valor de **$214.000.000 COP**. Firma registrada el `2026-06-01` y finalización prevista para el `2026-08-29`, manteniendo la `fecha_de_inicio_del_contrato` *"vacía por el momento"*.
* *Implicación Forense:* Incurre en imprecisión jurídica sobre el plazo de ejecución y el cumplimiento de requisitos de ejecución (aprobación de garantías y acta de inicio), arriesgando pagos extemporáneos o indeterminación en el control de ejecución.

### C. Posible Presunción de Fraccionamiento de Contratos y Uso Excesivo de Mínima Cuantía
* Durante los meses de mayo y junio de 2026, la Gobernación de Boyacá tramitó 14 procesos por la modalidad de Mínima Cuantía.
* Llama la atención la concentración de múltiples procesos bajo conceptos genéricos de *"Prestación de servicios"* y *"Suministros"*, varios de los cuales bordean montos elevados e idénticos (ej. Juan Carlos Soto Torres por $148.820.000 COP y Agroautomotora SAS por $148.826.925 COP).
* *Implicación Forense:* Podría tratarse de un fraccionamiento del objeto contractual para eludir procesos contractuales de mayor pluralidad de oferentes (Selección Abreviada o Licitación Pública).

### D. Inconsistencias e Incompletitud en Registro SECOP
* **Proceso AMS-MIN-C-18-2026 (Alcaldía de Susacón):** Presenta un monto cargado de $48.961.900 COP, pero registra el contratista como *"En proceso de adjudicación"* y todas las fechas operativas en *"N/A"*. Se advierte la imputación de montos financieros en registros incompletos dentro de la plataforma pública.

---

## 3. Análisis de Contratistas y Concentración Económica

Se evidencia una **alta concentración del gasto público en solo tres (3) contratistas**, los cuales absorben el **67,74% ($3.049.211.531,87 COP)** del total asignado en la muestra analizada.

```
       [Top 3 Contratistas - Concentración de Recursos]
┌────────────────────────────────────────┬─────────────────────────┐
│ VARESCO FUEL OIL S.A.S                 │ $1.339.442.325,00 (29,76%)│
│ ASC LTDA.                              │ $1.154.690.615,00 (25,65%)│
│ ANDRES FERNANDO MUÑOZ LOPEZ            │   $555.078.591,87 (12,33%)│
│ Resto de Contratistas (18 procesos)    │ $1.452.002.080,25 (32,26%)│
└────────────────────────────────────────┴─────────────────────────┘
```

1. **VARESCO FUEL OIL S.A.S (NIT 901060540):**
   * **Valor:** $1.339.442.325,00 COP.
   * **Modalidad:** Selección Abreviada de Menor Cuantía (Suministros).
   * **Riesgo:** Representa casi un tercio del presupuesto total asignado en el periodo analizado. Requiere verificación de la capacidad residual y antecedentes de idoneidad.

2. **ASC LTDA. (NIT 900087984):**
   * **Valor:** $1.154.690.615,00 COP.
   * **Modalidad:** Selección Abreviada Subasta Inversa (Compraventa).
   * **Riesgo:** Plazo de ejecución significativamente corto (2 meses: 19-jun a 18-ago) para una cuantía superior a los 1.100 millones de pesos, lo que podría señalar pliegos hechos a la medida o exigencias operativas con tiempos desproporcionados.

3. **ANDRES FERNANDO MUÑOZ LOPEZ (NIT 1130672304):**
   * **Valor:** $555.078.591,87 COP.
   * **Modalidad:** Selección Abreviada Subasta Inversa (Suministros).
   * **Riesgo:** Persona natural adjudicataria de un contrato superior a 550 millones de pesos. Requiere verificación especial de capacidad financiera, operativa y estructura logística propia frente al objeto contratado.

---

## 4. Conclusión Forense

El análisis forense permite concluir que la contratación examinada presenta **indicadores de riesgo medio-alto**, caracterizados por:

1. **Inobservancia de requisitos de perfeccionamiento e inicio:** Se constató la existencia de contratación ejecutada sin firma formalizada y procesos adjudicados sin reporte de fecha de inicio.
2. **Alta vulnerabilidad en la planificación de la Gobernación de Boyacá:** El uso intensivo de la modalidad de Mínima Cuantía en periodos muy estrechos (mayo a junio de 2026) exige una revisión amplia de los planes anuales de compras para descartar encubrimiento de modalidades competitivas ordinarias.
3. **Elevado nivel de concentración presupuestal:** El 67,7% de los recursos públicos fiscalizados recae en tres actores privados, lo que restringe el principio de concurrencia y genera una dependencia crítica sobre pocos proveedores.

**Recomendación:** Se sugiere elevar este expediente a los organismos de control (Contraloría General de la República y Procuraduría General de la Nación) para realizar auditorías de cumplimiento sobre los expedientes contractuales físicos/digitales, actas de inicio, estudios previos de conveniencia e impositiva verificación de la ejecución real de las prestaciones contractuales reportadas.