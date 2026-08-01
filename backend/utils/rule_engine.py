"""
comparisons.py / rule_engine.py
----------------
Reglas de comparación temporal para auditoría de contratos SECOP.

Cambios respecto a la versión original:

1. Calendario de festivos colombianos real. `numpy.busday_offset` /
   `numpy.busday_count` por defecto solo excluyen sábados y domingos;
   sin un `busdaycalendar` con festivos, cualquier plazo que cruce un
   festivo nacional se calculaba mal. Ahora se construye un
   `np.busdaycalendar` con los festivos de Colombia (vía la librería
   `holidays`) para el rango de años presente en los datos.

2. Columnas de resultado (`*_cumple`, `*_diff`) usan dtypes nullable
   de pandas (`boolean`, `Int64`) desde su creación, en vez de arrancar
   en `None` (dtype `object`) y mutar de tipo al asignar. Esto evita
   comportamientos inconsistentes en agregaciones, exportes y formato
   condicional aguas abajo.

3. Las fechas que no se pudieron parsear (`errors='coerce'` -> `NaT`)
   ya no se pierden en silencio: se cuentan y se exponen en
   `df_result.attrs["fechas_invalidas"]` para que el reporte de
   auditoría pueda declarar cuántos registros quedaron excluidos de
   cada regla y por qué.

4. La Regla 1 (Firma vs. Publicación) sigue usando `ultima_actualizacion`
   como proxy de fecha de publicación -- SECOP/Socrata no expone una
   columna de fecha de publicación real -- pero ahora esa limitación
   queda declarada explícitamente en una columna de confianza
   (`regla_firma_pub_confiable = False`) y en `df_result.attrs`, en vez
   de presentarse con la misma certeza que las reglas 2 y 3. Si en tu
   dataset SÍ existe una columna de publicación real, pásala en
   `pub_col_override` y la regla se vuelve confiable automáticamente.

5. Parseo de fechas con `utc=True` + conversión a naive, para evitar
   comportamiento inconsistente de pandas ante columnas con timestamps
   mixtos (con y sin offset).

6. `roll='forward'` documentado explícitamente como decisión de negocio
   (no un descuido): la fecha de firma se "rueda" al siguiente día
   hábil antes de sumar los 3 días, si cae en fin de semana/festivo.
"""

from __future__ import annotations

import logging
from datetime import date

import numpy as np
import pandas as pd

try:
    import holidays as holidays_lib
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "Este módulo requiere la librería 'holidays' "
        "(pip install holidays) para calcular días hábiles con "
        "festivos colombianos."
    ) from exc

logger = logging.getLogger(__name__)

DATE_COLS = [
    'fecha_de_firma',
    'fecha_de_inicio_del_contrato',
    'fecha_de_fin_del_contrato',
    'ultima_actualizacion',
]

# Margen de años extra por si algún festivo cae justo en el borde del
# rango de fechas del dataset (p. ej. un plazo que empieza el 30 de
# diciembre y cruza al 1 de enero).
_YEAR_MARGIN = 1


# --------------------------------------------------------------------------
# Calendario de días hábiles
# --------------------------------------------------------------------------

def _build_colombia_busdaycal(df: pd.DataFrame, date_cols: list[str]) -> np.busdaycalendar:
    """
    Construye un numpy.busdaycalendar con los festivos colombianos
    correspondientes al rango de años presente en `date_cols`.
    Si no hay ninguna fecha válida, usa el año actual como fallback.
    """
    years: set[int] = set()
    for col in date_cols:
        if col in df.columns:
            valid_years = df[col].dropna().dt.year.unique().tolist()
            years.update(int(y) for y in valid_years)

    if not years:
        years = {date.today().year}

    year_range = range(min(years) - _YEAR_MARGIN, max(years) + _YEAR_MARGIN + 1)
    co_holidays = holidays_lib.Colombia(years=list(year_range))
    holiday_dates = np.array(sorted(co_holidays.keys()), dtype='datetime64[D]')

    return np.busdaycalendar(weekmask='1111100', holidays=holiday_dates)


# --------------------------------------------------------------------------
# Helpers de columnas nullable
# --------------------------------------------------------------------------

def _init_result_columns(df: pd.DataFrame, prefix: str) -> None:
    n = len(df)
    df[f'{prefix}_cumple'] = pd.array([pd.NA] * n, dtype="boolean")
    df[f'{prefix}_diff'] = pd.array([pd.NA] * n, dtype="Int64")


def _to_datetime64_days(series: pd.Series) -> np.ndarray:
    return series.values.astype('datetime64[D]')


# --------------------------------------------------------------------------
# API pública
# --------------------------------------------------------------------------

def apply_comparisons(df: pd.DataFrame, pub_col_override: str | None = None) -> pd.DataFrame:
    """
    Aplica las reglas de comparación temporal usando pandas y
    numpy.busday_offset/busday_count con calendario de festivos
    colombianos.

    Parameters
    ----------
    df:
        DataFrame con (al menos, si existen) las columnas de DATE_COLS.
    pub_col_override:
        Nombre de una columna con la fecha de publicación REAL del
        contrato, si el dataset la tiene. Si se provee, la Regla 1 se
        calcula sobre esa columna y se marca como confiable. Si no se
        provee, se usa 'ultima_actualizacion' como proxy y se marca
        explícitamente como NO confiable.

    Returns
    -------
    pd.DataFrame
        Copia de `df` con las columnas de reglas agregadas. Además,
        `resultado.attrs["fechas_invalidas"]` contiene un dict con el
        conteo de valores no parseables por columna, y
        `resultado.attrs["reglas_meta"]` documenta qué reglas son
        confiables.
    """
    if df.empty:
        return df

    df_result = df.copy()
    fechas_invalidas: dict[str, int] = {}

    # --- Parseo de fechas -------------------------------------------------
    for col in DATE_COLS:
        if col not in df_result.columns:
            df_result[col] = pd.NaT
            continue

        raw_non_null = df_result[col].notna().sum()
        # utc=True evita comportamiento inconsistente ante timestamps
        # mixtos (con/sin offset); luego se vuelve naive para comparar
        # con numpy.datetime64[D].
        parsed = pd.to_datetime(df_result[col], errors='coerce', utc=True)
        if parsed.dt.tz is not None:
            parsed = parsed.dt.tz_convert(None)
        df_result[col] = parsed

        parsed_non_null = df_result[col].notna().sum()
        invalid_count = int(raw_non_null - parsed_non_null)
        if invalid_count > 0:
            fechas_invalidas[col] = invalid_count
            logger.warning(
                "%s valores de '%s' no se pudieron parsear como fecha y "
                "quedaron como NaT (excluidos de las reglas).",
                invalid_count, col,
            )

    # --- Calendario de días hábiles (festivos colombianos) ---------------
    busdaycal = _build_colombia_busdaycal(df_result, DATE_COLS)

    reglas_meta: dict[str, dict] = {}

    # --- REGLA 1: Firma vs Publicación ------------------------------------
    pub_col = pub_col_override or 'ultima_actualizacion'
    es_proxy = pub_col_override is None

    if pub_col in df_result.columns and 'fecha_de_firma' in df_result.columns:
        _init_result_columns(df_result, 'regla_firma_pub')
        df_result['regla_firma_pub_confiable'] = not es_proxy

        valid_mask = df_result['fecha_de_firma'].notna() & df_result[pub_col].notna()

        if valid_mask.any():
            fechas_firma_np = _to_datetime64_days(df_result.loc[valid_mask, 'fecha_de_firma'])
            fechas_pub_np = _to_datetime64_days(df_result.loc[valid_mask, pub_col])

            # roll='forward': si la fecha de firma cae en fin de semana o
            # festivo, se "rueda" al siguiente día hábil ANTES de sumar
            # los 3 días hábiles. Decisión de negocio deliberada, no un
            # descuido: el plazo se cuenta desde el primer día hábil
            # disponible tras la firma.
            firma_plus_3 = np.busday_offset(
                fechas_firma_np, 3, roll='forward', busdaycal=busdaycal
            )

            cumple = firma_plus_3 >= fechas_pub_np
            diff_days = np.busday_count(firma_plus_3, fechas_pub_np, busdaycal=busdaycal)

            df_result.loc[valid_mask, 'regla_firma_pub_cumple'] = cumple
            df_result.loc[valid_mask, 'regla_firma_pub_diff'] = diff_days

        reglas_meta['regla_firma_pub'] = {
            "confiable": not es_proxy,
            "columna_publicacion_usada": pub_col,
            "nota": (
                "Usa 'ultima_actualizacion' como proxy de fecha de "
                "publicación porque SECOP/Socrata no expone una columna "
                "de publicación real. 'ultima_actualizacion' cambia "
                "también ante ediciones posteriores del registro, por lo "
                "que esta regla puede sobreestimar incumplimientos en "
                "contratos editados mucho después de firmados. Tratar "
                "como orientativa, no concluyente."
            ) if es_proxy else "Calculada sobre columna de publicación real provista.",
        }

    # --- REGLA 2: Firma vs Inicio ------------------------------------------
    if 'fecha_de_inicio_del_contrato' in df_result.columns and 'fecha_de_firma' in df_result.columns:
        _init_result_columns(df_result, 'regla_firma_inicio')

        valid_mask = df_result['fecha_de_firma'].notna() & df_result['fecha_de_inicio_del_contrato'].notna()

        if valid_mask.any():
            fechas_firma_np = _to_datetime64_days(df_result.loc[valid_mask, 'fecha_de_firma'])
            fechas_inicio_np = _to_datetime64_days(df_result.loc[valid_mask, 'fecha_de_inicio_del_contrato'])

            cumple = fechas_inicio_np >= fechas_firma_np
            diff_days = np.busday_count(fechas_firma_np, fechas_inicio_np, busdaycal=busdaycal)

            df_result.loc[valid_mask, 'regla_firma_inicio_cumple'] = cumple
            df_result.loc[valid_mask, 'regla_firma_inicio_diff'] = diff_days

        reglas_meta['regla_firma_inicio'] = {"confiable": True}

    # --- REGLA 3: Inicio vs Terminación -------------------------------------
    if 'fecha_de_inicio_del_contrato' in df_result.columns and 'fecha_de_fin_del_contrato' in df_result.columns:
        _init_result_columns(df_result, 'regla_inicio_fin')

        valid_mask = df_result['fecha_de_inicio_del_contrato'].notna() & df_result['fecha_de_fin_del_contrato'].notna()

        if valid_mask.any():
            fechas_inicio_np = _to_datetime64_days(df_result.loc[valid_mask, 'fecha_de_inicio_del_contrato'])
            fechas_fin_np = _to_datetime64_days(df_result.loc[valid_mask, 'fecha_de_fin_del_contrato'])

            cumple = fechas_fin_np > fechas_inicio_np
            diff_days = np.busday_count(fechas_inicio_np, fechas_fin_np, busdaycal=busdaycal)

            df_result.loc[valid_mask, 'regla_inicio_fin_cumple'] = cumple
            df_result.loc[valid_mask, 'regla_inicio_fin_diff'] = diff_days

        reglas_meta['regla_inicio_fin'] = {"confiable": True}

    df_result.attrs["fechas_invalidas"] = fechas_invalidas
    df_result.attrs["reglas_meta"] = reglas_meta

    return df_result
