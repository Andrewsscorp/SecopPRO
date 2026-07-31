import pandas as pd
import numpy as np

def apply_comparisons(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aplica las reglas de comparación base usando Pandas y numpy.busday_offset
    Retorna el DataFrame con nuevas columnas de estado de alertas.
    """
    if df.empty:
        return df
        
    df_result = df.copy()
    
    # Asegurarnos de que existan las columnas de fechas
    date_cols = ['fecha_de_firma', 'fecha_de_inicio_del_contrato', 'fecha_de_fin_del_contrato', 'ultima_actualizacion']
    for col in date_cols:
        if col not in df_result.columns:
            df_result[col] = pd.NaT
        else:
            # Socrata usa formato ISO, ej: "2024-04-15T00:00:00.000"
            df_result[col] = pd.to_datetime(df_result[col], errors='coerce')

    # Convertir a formato de fecha (sin zona horaria para busday_offset)
    for col in date_cols:
        if df_result[col].dt.tz is not None:
            df_result[col] = df_result[col].dt.tz_localize(None)

    # REGLA 1: Firma vs Publicación (ultima_actualizacion / fecha de publicación)
    # Por defecto en SECOP, compararemos fecha de firma con última actualización
    # TODO: Podría usarse una columna específica si existe (ej. fecha_publicacion)
    pub_col = 'ultima_actualizacion'
    if pub_col in df_result.columns and 'fecha_de_firma' in df_result.columns:
        # Calcular Firma + 3 días hábiles
        valid_mask = df_result['fecha_de_firma'].notna() & df_result[pub_col].notna()
        
        # Inicializar columnas de resultados
        df_result['regla_firma_pub_cumple'] = None
        df_result['regla_firma_pub_diff'] = None
        
        if valid_mask.any():
            fechas_firma_np = df_result.loc[valid_mask, 'fecha_de_firma'].values.astype('datetime64[D]')
            fechas_pub_np = df_result.loc[valid_mask, pub_col].values.astype('datetime64[D]')
            
            # Firma + 3 días hábiles
            firma_plus_3 = np.busday_offset(fechas_firma_np, 3, roll='forward')
            
            # Comparamos: ¿Es Firma + 3 días >= Publicación?
            cumple = firma_plus_3 >= fechas_pub_np
            
            # Días de diferencia (hábiles)
            diff_days = np.busday_count(firma_plus_3, fechas_pub_np)
            
            df_result.loc[valid_mask, 'regla_firma_pub_cumple'] = cumple
            df_result.loc[valid_mask, 'regla_firma_pub_diff'] = diff_days

    # REGLA 2: Firma vs Inicio
    if 'fecha_de_inicio_del_contrato' in df_result.columns and 'fecha_de_firma' in df_result.columns:
        valid_mask = df_result['fecha_de_firma'].notna() & df_result['fecha_de_inicio_del_contrato'].notna()
        
        df_result['regla_firma_inicio_cumple'] = None
        df_result['regla_firma_inicio_diff'] = None
        
        if valid_mask.any():
            fechas_firma_np = df_result.loc[valid_mask, 'fecha_de_firma'].values.astype('datetime64[D]')
            fechas_inicio_np = df_result.loc[valid_mask, 'fecha_de_inicio_del_contrato'].values.astype('datetime64[D]')
            
            # Inicio no debe ser menor que Firma
            cumple = fechas_inicio_np >= fechas_firma_np
            diff_days = np.busday_count(fechas_firma_np, fechas_inicio_np)
            
            df_result.loc[valid_mask, 'regla_firma_inicio_cumple'] = cumple
            df_result.loc[valid_mask, 'regla_firma_inicio_diff'] = diff_days

    # REGLA 3: Inicio vs Terminación
    if 'fecha_de_inicio_del_contrato' in df_result.columns and 'fecha_de_fin_del_contrato' in df_result.columns:
        valid_mask = df_result['fecha_de_inicio_del_contrato'].notna() & df_result['fecha_de_fin_del_contrato'].notna()
        
        df_result['regla_inicio_fin_cumple'] = None
        df_result['regla_inicio_fin_diff'] = None
        
        if valid_mask.any():
            fechas_inicio_np = df_result.loc[valid_mask, 'fecha_de_inicio_del_contrato'].values.astype('datetime64[D]')
            fechas_fin_np = df_result.loc[valid_mask, 'fecha_de_fin_del_contrato'].values.astype('datetime64[D]')
            
            # Terminación debe ser mayor que Inicio
            cumple = fechas_fin_np > fechas_inicio_np
            diff_days = np.busday_count(fechas_inicio_np, fechas_fin_np)
            
            df_result.loc[valid_mask, 'regla_inicio_fin_cumple'] = cumple
            df_result.loc[valid_mask, 'regla_inicio_fin_diff'] = diff_days

    return df_result
