# Trabajo autónomo con agentes: el método del ground truth

> Documento portable, agnóstico de proyecto. Copialo a cualquier repo. Su
> propósito: definir cuándo y cómo delegar trabajo a un agente de IA en una
> sesión larga **sin supervisión humana continua**, de forma segura.
>
> Audiencia doble: el humano (para decidir qué delegar y cómo encargarlo) y el
> asistente/agente (para saber cómo autoverificarse). Nació de una sesión real
> donde el método funcionó; las lecciones están destiladas, no en abstracto.

---

## 0. El problema que resuelve

Delegar trabajo a un agente que corre solo es tentador pero peligroso: el modo
de fallo más común no es que el agente se rompa ruidosamente, sino que **produzca
algo que parece correcto y no lo es** (números plausibles pero falsos, tests que
pasan pero miden lo equivocado, un reporte que oculta lo que no cerró). Un humano
ausente no puede atrapar eso en el momento.

La solución no es "mejor prompt" ni "más inteligencia". Es **construir la
verificación DENTRO de la tarea**, de modo que el agente no pueda declarar éxito
falso porque hay un ancla objetiva que se lo impide.

A esa ancla la llamamos **ground truth**: un resultado conocido y verdadero,
independiente del agente, contra el cual su trabajo se compara automáticamente.

---

## 1. La regla central

> **No delegues una tarea a un agente autónomo a menos que tenga un criterio de
> "terminado" que sea (a) binario, (b) verificable sin el humano, y (c) anclado
> en algo que el agente no pueda fabricar.**

Si no podés definir ese criterio, la tarea NO es apta para autonomía — hacela
supervisada, o primero construí el ground truth y después delegá.

---

## 2. Qué es un buen ground truth

Un ground truth es un par **(entrada conocida → salida correcta conocida)** que
ya existía ANTES de la tarea, idealmente producido por un camino distinto al que
el agente va a usar.

Ejemplos de ground truth fuerte:
- **Casos de referencia con resultado conocido.** "Este cálculo nuevo debe
  reproducir el resultado X que ya obtuvimos por otro método para el caso Y."
  (En la sesión origen: dos casos de cliente cuyos números ya conocíamos; el
  código nuevo tenía que reproducirlos o el test fallaba.)
- **Una fuente externa de verdad.** Cuando dos cálculos discrepan, una fuente
  independiente (un dataset oficial, una API canónica, un valor publicado)
  desempata. El agente debe consultarla, no defender su propio número.
- **Tests existentes que deben seguir verdes.** "El sistema actual hace N cosas
  bien (N tests). Tu cambio no puede romper ninguno." El número N es el ancla.
- **Una propiedad invariante.** "Con la opción apagada, el resultado debe ser
  bit-idéntico al anterior." Eso es verificable sin juicio humano.

Ground truth **débil o falso** (evitar):
- "El agente revisa su propio trabajo." Comparte sus sesgos; no es independiente.
- "El humano experto escribe los casos de prueba." Si el experto conoce el
  sistema, escribe casos que le hablan al sistema, no casos realistas — sesgo
  de contaminación. (El antídoto: el humano *juzga* la salida, no *crea* la
  entrada.)
- "Los tests los genera el mismo modelo que resuelve la tarea." Contaminación de
  evaluación: mide fácil lo que el modelo genera fácil.

---

## 3. Cómo encargar una tarea autónoma (checklist para el humano)

1. **Definí el ground truth primero.** ¿Qué resultado conocido tiene que
   reproducir? Si no hay ninguno, ¿podés construir uno barato antes de delegar?
2. **Hacé el criterio de "terminado" binario.** "Tests verdes + reproduce los
   casos de referencia." No "que quede bien".
3. **Acotá el blast radius.** Decile explícitamente qué NO puede tocar (ej. "no
   modifiques el núcleo X, solo leelo; sos una capa nueva encima"). Aislá el
   trabajo (worktree, branch separada) para que nada se mezcle hasta revisar.
4. **Dale las reglas de proceso.** Commits atómicos con trazabilidad del porqué;
   correr la suite COMPLETA de verificación en cada paso, no solo lo que tocó;
   regla anti-invención (ver §5).
5. **Pedile un reporte honesto.** Que liste los supuestos que tomó, las
   ambigüedades que encontró, y **lo que NO pudo cerrar**. Un reporte que oculta
   un problema es peor que uno que lo expone. Decíselo con esas palabras.
6. **Reservá las decisiones de criterio para vos.** El agente NO debe tomar
   decisiones de producto, de activación en producción, ni resolver ambigüedades
   de diseño con peso. Esas las marca y te las deja.

---

## 4. Cómo autoverificarse (checklist para el agente)

1. **Antes de empezar:** confirmá el ground truth y que el sistema arranca en
   estado verde conocido (ej. "N tests pasan hoy"). Si no podés establecer la
   línea base, paralo y reportá.
2. **Trabajá incremental:** un cambio conceptual = un commit, cada uno con su
   porqué.
3. **Verificá contra el ground truth, no contra tu intuición.** Si tu resultado
   no reproduce el caso de referencia, NO declares éxito — reportá qué no cuadra.
4. **Corré la verificación completa en cada paso**, no solo lo que tocaste. Un
   cambio puede romper algo aguas abajo que un chequeo focalizado no ve.
5. **No inventes (ver §5).**
6. **Si descubrís una ambigüedad o necesitás tomar una decisión de criterio:**
   tomá la opción obvia, marcala explícitamente como supuesto, seguí, y anotala
   en el reporte. No frenes por micro-decisiones, pero no las escondas.
7. **El reporte final dice la verdad**, incluido lo que falló o quedó abierto.

---

## 5. La regla anti-invención (la más importante)

> **Nunca rellenes un dato crítico con un valor inventado. Si falta, preguntá,
> usá un default explícito y marcado, o dejalo ausente — pero nunca "con
> servilleta".**

Cada valor producido debería poder rastrearse a su origen:
`dicho` (provisto explícitamente) / `default-asumido` (puse un valor por defecto,
confirmá) / `derivado` (calculado de otros) / `ausente` (no se mencionó y no
aplica). Esa **procedencia es el audit trail**: convierte el mayor riesgo (un
número inventado que parece confiable) en el mayor diferenciador (transparencia
verificable). Lo que está ausente se queda ausente; no se inventa un default
donde no corresponde.

---

## 6. Señales de que una tarea NO es apta para autonomía

- No tiene ground truth y no podés construir uno.
- El "terminado" depende de juicio subjetivo o de preferencia humana.
- Requiere decisiones de producto, de activación, o de diseño con consecuencias.
- El blast radius no se puede acotar (toca el núcleo crítico inevitablemente).
- El resultado solo se puede validar "mirándolo" (no hay test ni ancla).

Para estas: trabajo supervisado, o partir la tarea hasta aislar la parte que SÍ
tiene ground truth y delegar solo esa.

---

## 7. Después de que el agente termina (checklist del humano/revisor)

1. **No te fíes del reporte — verificá de primera mano.** Corré vos mismo la
   verificación clave (los tests, el ground truth). El reporte puede ser
   optimista de buena fe.
2. **Mirá el diff incremental real**, no el resumen. Confirmá que tocó solo lo
   que debía y nada más.
3. **Revisá los supuestos que marcó.** Ahí es donde tu criterio agrega valor.
4. **Atendé lo que reportó como "no cerrado".** Es la parte honesta y la que
   suele importar.
5. Recién entonces integrá.

---

## 8. Resumen en una línea

El trabajo autónomo seguro no se logra confiando más en el agente, sino
**quitándole la posibilidad de fabricar éxito**: ground truth independiente +
criterio binario + blast radius acotado + regla anti-invención + verificación
humana del resultado, no del reporte.
