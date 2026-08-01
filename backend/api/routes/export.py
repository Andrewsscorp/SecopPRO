from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database.database import get_db
import pandas as pd
import os
import uuid
from pydantic import BaseModel
from typing import List

from .dashboard import get_contratos_df

router = APIRouter()

class ExportRequest(BaseModel):
    jobId: str
    q: str = ""
    # Podrían enviarse las columnas exactas seleccionadas por el usuario para exportarlas
    columns: List[str] = []

@router.post("/excel")
def export_excel(req: ExportRequest, db: Session = Depends(get_db)):
    try:
        df = get_contratos_df(db, req.jobId)
        if df.empty:
            raise HTTPException(status_code=404, detail="No hay datos para exportar")
            
        if req.q:
            mask = df.astype(str).apply(lambda x: x.str.contains(req.q, case=False, na=False)).any(axis=1)
            df = df[mask]
            
        # Mapeo de llaves del frontend a columnas reales del DataFrame
        FRONTEND_TO_SECOP = {
            # Requeridas
            "nombre_entidad": ["nombre_entidad", "entidad"],
            "nit_entidad": ["nit_entidad", "documento_proveedor", "codigo_entidad"],
            "ciudad": ["ciudad", "departamento"],
            "valor_contrato": ["valor_del_contrato", "valor_contrato", "valor_pendiente_de_ejecucion", "valor_pendiente_de"],
            "fecha_contrato": ["fecha_de_firma"],
            "nombre_representante": ["nombre_representante_legal"],
            "identificacion_representante": ["identificaci_n_representante_legal", "tipo_de_identificaci_n_representante_legal"],
            "telefono_representante": ["telefono_representante_legal", "tel_fono_representante_legal"],
            "correo_representante": ["correo_representante_legal", "correo_electronico_representante"],
            "tipo_contrato": ["tipo_de_contrato", "modalidad_de_contratacion"],

            # Ocultas
            "numero_proceso": ["llave_busqueda", "id_contrato", "referencia_del_contrato", "proceso_de_compra", "internal_id"],
            "objeto": ["descripcion_del_proceso", "codigo_de_categoria_principal", "condiciones_de_entrega", "justificacion_modalidad_de"],
            "contratista": ["proveedor_adjudicado", "es_grupo", "es_pyme", "codigo_proveedor"],
            "estado": ["estado_contrato"],
            "documentos": ["urlproceso", "documentos_tipo", "descripcion_documentos_tipo", "ultima_actualizacion"],
            "contratos": ["fecha_de_inicio_del_contrato", "fecha_de_fin_del_contrato", "duraci_n_del_contrato", "dias_adicionados", "el_contrato_puede_ser_prorrogado", "fecha_de_notificaci_n_de_prorrogaci_n", "nombre_supervisor", "tipo_de_documento_supervisor", "n_mero_de_documento_supervisor", "nombre_ordenador_del_gasto"],
            "pagos": ["valor_pagado", "valor_pendiente_de_pago", "valor_amortizado", "valor_facturado", "valor_de_pago_adelantado", "saldo_cdp", "saldo_vigencia", "nombre_del_banco", "tipo_de_cuenta", "n_mero_de_cuenta", "nombre_ordenador_de_pago"],
            "actas": ["liquidaci_n", "fecha_inicio_liquidacion", "fecha_fin_liquidacion"],
            "garantias": ["obligaci_n_ambiental", "obligaciones_postconsumo"],
            "polizas": [], # Para OCR

            
            # Comparaciones Automáticas
            "regla_firma_pub": ["regla_firma_pub_cumple", "regla_firma_pub_diff"],
            "regla_firma_inicio": ["regla_firma_inicio_cumple", "regla_firma_inicio_diff"],
            "regla_inicio_fin": ["regla_inicio_fin_cumple", "regla_inicio_fin_diff"],
        }
        NODE_META = {
            "nombre_entidad": {"title": "Entidad", "color": "#eff6ff"},
            "nit_entidad": {"title": "NIT Entidad", "color": "#eff6ff"},
            "ciudad": {"title": "Ciudad", "color": "#eff6ff"},
            "valor_contrato": {"title": "Valor", "color": "#fefce8"},
            "fecha_contrato": {"title": "Fecha Firma", "color": "#f0f9ff"},
            "nombre_representante": {"title": "Representante", "color": "#ffedd5"},
            "identificacion_representante": {"title": "Doc. Representante", "color": "#ffedd5"},
            "telefono_representante": {"title": "Teléfono Rep.", "color": "#ffedd5"},
            "correo_representante": {"title": "Correo Rep.", "color": "#ffedd5"},
            "tipo_contrato": {"title": "Tipo Contrato", "color": "#f5f3ff"},
            
            "numero_proceso": {"title": "Número Proceso", "color": "#f0fdf4"},
            "objeto": {"title": "Objeto", "color": "#fdf4ff"},
            "contratista": {"title": "Contratista", "color": "#fff7ed"},
            "estado": {"title": "Estado", "color": "#ecfdf5"},
            "documentos": {"title": "Documentos", "color": "#f8fafc"},
            "contratos": {"title": "Contratos", "color": "#f0f9ff"},
            "pagos": {"title": "Pagos", "color": "#ecfccb"},
            "actas": {"title": "Actas", "color": "#ccfbf1"},
            "garantias": {"title": "Garantías", "color": "#e0e7ff"},
            "polizas": {"title": "Pólizas", "color": "#fae8ff"},
            
            "regla_firma_pub": {"title": "Firma vs Pub", "color": "#ffe4e6"},
            "regla_firma_inicio": {"title": "Firma vs Inicio", "color": "#ffe4e6"}, 
            "regla_inicio_fin": {"title": "Inicio vs Fin", "color": "#ffe4e6"},
        }
        
        col_node_map = {}
        
        if req.columns:
            # Expandir los toggles del frontend manteniendo el orden
            ordered_target_cols = []
            seen = set()
            for toggle_key in req.columns:
                for col in FRONTEND_TO_SECOP.get(toggle_key, []):
                    if col not in seen:
                        ordered_target_cols.append(col)
                        col_node_map[col] = toggle_key
                        seen.add(col)
                
            # Añadir dinámicamente cualquier columna de OCR generada
            ocr_columns = [c for c in df.columns if str(c).startswith("Resultado OCR ")]
            for ocr_col in ocr_columns:
                if ocr_col not in seen:
                    ordered_target_cols.append(ocr_col)
                    col_node_map[ocr_col] = "polizas" # Asignarlo al nodo de Pólizas/OCR
                    seen.add(ocr_col)
                    
            valid_cols = [c for c in ordered_target_cols if c in df.columns]
            if valid_cols:
                df = df[valid_cols]

        # Identificar y convertir columnas numéricas y de fecha
        monetary_cols = [c for c in df.columns if any(k in str(c).lower() for k in ['valor', 'saldo', 'precio'])]
        date_cols = [c for c in df.columns if 'fecha' in str(c).lower()]
        
        for col in monetary_cols:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
        for col in date_cols:
            # Algunos pueden ya ser datetime
            df[col] = pd.to_datetime(df[col], errors='coerce')
            
        # Limpiar cualquier objeto timezone-aware iterando por todo el df
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                try:
                    df[col] = df[col].dt.tz_localize(None)
                except Exception:
                    pass
            elif df[col].dtype == 'object':
                # Reemplazar caracteres ilegales o diccionarios que causan fallos
                df[col] = df[col].apply(lambda x: str(x) if isinstance(x, (dict, list)) else x)
                
        # Llenar strings vacíos / NaNs
        for col in df.columns:
            if col not in monetary_cols and col not in date_cols:
                # Convertir explícitamente a objeto para permitir meter strings en columnas booleanas
                df[col] = df[col].astype(object)
                df[col] = df[col].fillna("NO DISPONIBLE")
                
        # Crear árbol de carpetas de Resultados de Usuario (Dinámico)
        user_docs = os.path.join(os.path.expanduser('~'), 'Documents', 'SecopPRO_Consul', req.jobId)
        excel_dir = os.path.join(user_docs, 'Resultados_Excel')
        os.makedirs(excel_dir, exist_ok=True)
        
        # El archivo final con las columnas extraídas
        filename = os.path.join(excel_dir, f"Reporte_SecopPRO_{uuid.uuid4().hex[:8]}.xlsx")
        
        # Escribir con Pandas a Excel usando xlsxwriter para formato
        writer = pd.ExcelWriter(filename, engine='xlsxwriter', datetime_format='yyyy-mm-dd')
    # startrow=1 porque en la row 0 pondremos los "Super Headers" de Nodos
        df.to_excel(writer, index=False, sheet_name='Reporte SECOP', startrow=1)
        
        workbook  = writer.book
        worksheet = writer.sheets['Reporte SECOP']
        
        # Formatos
        format_cache = {}
        def get_format(bg_color, num_format=None, is_header=False, is_super=False):
            key = (bg_color, num_format, is_header, is_super)
            if key not in format_cache:
                props = {'bg_color': bg_color} if bg_color else {}
                if is_super:
                    props.update({'bold': True, 'align': 'center', 'valign': 'vcenter', 'border': 1, 'font_size': 12, 'font_color': '#111827'})
                elif is_header:
                    props.update({'bold': True, 'align': 'center', 'valign': 'vcenter', 'border': 1, 'bottom': 2, 'font_color': '#374151'})
                else:
                    props.update({'border': 1, 'border_color': '#e5e7eb'})
                
                if num_format:
                    props['num_format'] = num_format
                format_cache[key] = workbook.add_format(props)
            return format_cache[key]
            
        no_disp_format = workbook.add_format({
            'font_color': '#ef4444', 
            'bold': True
        })
        
        # --- DIBUJAR SUPER HEADERS (NODOS) ---
        current_node = None
        start_col = 0
        
        for i, col in enumerate(df.columns):
            node_key = col_node_map.get(col, None)
            
            # Merge if node changes or it's the last column
            if node_key != current_node:
                if current_node is not None:
                    title = NODE_META.get(current_node, {}).get("title", "Otros")
                    color = NODE_META.get(current_node, {}).get("color", "#ffffff")
                    super_fmt = get_format(bg_color=color, is_super=True)
                    
                    if start_col == i - 1:
                        worksheet.write(0, start_col, title, super_fmt)
                    else:
                        worksheet.merge_range(0, start_col, 0, i - 1, title, super_fmt)
                current_node = node_key
                start_col = i
                
        # Cierre del último nodo
        if current_node is not None:
            title = NODE_META.get(current_node, {}).get("title", "Otros")
            color = NODE_META.get(current_node, {}).get("color", "#ffffff")
            super_fmt = get_format(bg_color=color, is_super=True)
            if start_col == len(df.columns) - 1:
                worksheet.write(0, start_col, title, super_fmt)
            else:
                worksheet.merge_range(0, start_col, 0, len(df.columns) - 1, title, super_fmt)
                
        # --- APLICAR FORMATOS A COLUMNAS INDIVIDUALES ---
        for i, col in enumerate(df.columns):
            node_key = col_node_map.get(col, None)
            color = NODE_META.get(node_key, {}).get("color", "#ffffff") if node_key else "#ffffff"
            
            # Formato del encabezado (fila 1)
            header_fmt = get_format(bg_color=color, is_header=True)
            worksheet.write(1, i, col, header_fmt)
            
            # Formato de la columna de datos (fila 2 en adelante)
            num_fmt = None
            if col in monetary_cols:
                num_fmt = '$#,##0.00'
            elif col in date_cols:
                num_fmt = 'yyyy-mm-dd'
                
            col_fmt = get_format(bg_color=color, num_format=num_fmt)
            
            # Ancho auto ajustado
            max_len = max(df[col].astype(str).map(len).max(), len(str(col))) + 2
            worksheet.set_column(i, i, min(max_len, 50), col_fmt)
            
        # Formato condicional: Si dice "NO DISPONIBLE", pintarlo de rojo
        worksheet.conditional_format(2, 0, len(df)+1, len(df.columns)-1, {
            'type': 'cell',
            'criteria': '==',
            'value': '"NO DISPONIBLE"',
        'format': no_disp_format
    })
    
        writer.close()
        
        # En un escenario real (producción), podríamos eliminar el archivo luego de servirlo usando BackgroundTasks
        return FileResponse(filename, filename="Reporte_SecopPRO.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno al exportar: {str(e)}")

@router.get("/zip/{jobId}/{id_contrato}")
def download_zip(jobId: str, id_contrato: str):
    """
    Resuelve dinámicamente la ruta de Documentos del usuario y busca el ZIP
    """
    user_docs = os.path.join(os.path.expanduser('~'), 'Documents', 'SecopPRO_Consul', jobId, 'DocumentosDescargados')
    os.makedirs(user_docs, exist_ok=True)
    zip_path = os.path.join(user_docs, f"{id_contrato}.zip")
    
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="El archivo ZIP aún no ha sido generado por el Scraper de SECOP II. Por favor espera unos momentos.")
        
    return FileResponse(zip_path, filename=f"{id_contrato}.zip", media_type="application/zip")
