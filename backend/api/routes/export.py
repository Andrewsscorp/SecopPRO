from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database.database import get_db
from database.models import ContratacionTerceros, PDFsConsulta
import pandas as pd
import os
import uuid
import json
import httpx
import re
from pydantic import BaseModel
from typing import List

from .dashboard import get_contratos_df

router = APIRouter()

class ExportRequest(BaseModel):
    jobId: str
    q: str = ""
    columns: List[str] = []

SOCRATA_URL = "https://www.datos.gov.co/resource/jbjy-vk9h.json"

@router.post("/excel")
async def export_excel(req: ExportRequest, db: Session = Depends(get_db)):
    try:
        df = get_contratos_df(db, req.jobId)
        if df.empty:
            raise HTTPException(status_code=404, detail="No hay datos para exportar")
            
        if req.q:
            mask = df.astype(str).apply(lambda x: x.str.contains(req.q, case=False, na=False)).any(axis=1)
            df = df[mask]
            
        FRONTEND_TO_SECOP = {
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

            "numero_proceso": ["llave_busqueda", "id_contrato", "referencia_del_contrato", "proceso_de_compra", "internal_id"],
            "objeto": ["descripcion_del_proceso", "codigo_de_categoria_principal", "condiciones_de_entrega", "justificacion_modalidad_de"],
            "contratista": ["proveedor_adjudicado", "es_grupo", "es_pyme", "codigo_proveedor"],
            "estado": ["estado_contrato"],
            "documentos": ["urlproceso", "documentos_tipo", "descripcion_documentos_tipo", "ultima_actualizacion"],
            "contratos": ["fecha_de_inicio_del_contrato", "fecha_de_fin_del_contrato", "duraci_n_del_contrato", "dias_adicionados", "el_contrato_puede_ser_prorrogado", "fecha_de_notificaci_n_de_prorrogaci_n", "nombre_supervisor", "tipo_de_documento_supervisor", "n_mero_de_documento_supervisor", "nombre_ordenador_del_gasto"],
            "pagos": ["valor_pagado", "valor_pendiente_de_pago", "valor_amortizado", "valor_facturado", "valor_de_pago_adelantado", "saldo_cdp", "saldo_vigencia", "nombre_del_banco", "tipo_de_cuenta", "n_mero_de_cuenta", "nombre_ordenador_de_pago"],
            "actas": ["liquidaci_n", "fecha_inicio_liquidacion", "fecha_fin_liquidacion"],
            "garantias": ["obligaci_n_ambiental", "obligaciones_postconsumo"],
            "polizas": [],
            
            "regla_firma_pub": ["regla_firma_pub_cumple", "regla_firma_pub_diff"],
            "regla_firma_inicio": ["regla_firma_inicio_cumple", "regla_firma_inicio_diff"],
            "regla_inicio_fin": ["regla_inicio_fin_cumple", "regla_inicio_fin_diff"],
            
            # Nuevas columnas anexas del tercero
            "informacion_anexa_tercero": [
                "anexo_total_contratos", 
                "anexo_valor_total", 
                "anexo_fecha_primer_contrato", 
                "anexo_fecha_ultimo_contrato", 
                "anexo_cantidad_pdfs", 
                "anexo_nombres_pdfs", 
                "anexo_sha256_pdfs", 
                "anexo_lista_entidades"
            ]
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
            
            "informacion_anexa_tercero": {"title": "Info. Histórica y Documental", "color": "#f3e8ff"}, # Purple pastel
        }
        
        # Determine the columns that contain the NIT and Llave Busqueda for lookups
        nit_col = next((c for c in ["documento_proveedor", "nit_entidad"] if c in df.columns), None)
        llave_col = next((c for c in ["llave_busqueda", "id_contrato", "proceso_de_compra", "uid"] if c in df.columns), None)
        
        include_anexo = ("informacion_anexa_tercero" in req.columns) or (not req.columns)
        
        # LOGICA DE ENRIQUECIMIENTO MASIVO
        if include_anexo and nit_col:
            # 1. Fetch missing NITs
            unique_nits = df[nit_col].dropna().unique().tolist()
            cached_nits_query = db.query(ContratacionTerceros.documento).filter(ContratacionTerceros.documento.in_(unique_nits)).all()
            cached_nits = {r[0] for r in cached_nits_query}
            
            missing_nits = [n for n in unique_nits if n not in cached_nits]
            if missing_nits:
                chunk_size = 50
                chunks = [missing_nits[i:i + chunk_size] for i in range(0, len(missing_nits), chunk_size)]
                async with httpx.AsyncClient(verify=False, timeout=60.0) as client:
                    for chunk in chunks:
                        in_clause = ",".join([f"'{nit}'" for nit in chunk])
                        query = f"documento_proveedor in ({in_clause})"
                        params = {"$where": query, "$limit": 50000}
                        try:
                            resp = await client.get(SOCRATA_URL, params=params)
                            if resp.status_code == 200:
                                data = resp.json()
                                grouped = {}
                                for row in data:
                                    n = row.get("documento_proveedor")
                                    if not n: continue
                                    if n not in grouped: grouped[n] = []
                                    grouped[n].append(row)
                                
                                for n, rows in grouped.items():
                                    nombre_contratista = rows[0].get("proveedor_adjudicado", "Desconocido")
                                    total_contratos = len(rows)
                                    valor_total = 0.0
                                    contratos_por_entidad = {}
                                    min_date, max_date = None, None
                                    
                                    for r in rows:
                                        val_str = r.get("valor_del_contrato", r.get("valor_contrato", "0"))
                                        try: valor_total += float(val_str)
                                        except ValueError: pass
                                        
                                        entidad = r.get("entidad", r.get("nombre_entidad", "Desconocida"))
                                        contratos_por_entidad[entidad] = contratos_por_entidad.get(entidad, 0) + 1
                                        
                                        fecha = r.get("fecha_de_firma", "")
                                        if fecha and len(fecha) >= 10:
                                            fecha_norm = fecha[:10]
                                            if not min_date or fecha_norm < min_date: min_date = fecha_norm
                                            if not max_date or fecha_norm > max_date: max_date = fecha_norm
                                            
                                    resumen = {
                                        "total_contratos": total_contratos,
                                        "valor_total": valor_total,
                                        "entidades_top": dict(sorted(contratos_por_entidad.items(), key=lambda item: item[1], reverse=True)[:5]),
                                        "hitos": {
                                            "primer_contrato": {"fecha": min_date} if min_date else None,
                                            "ultimo_contrato": {"fecha": max_date} if max_date else None
                                        }
                                    }
                                    nuevo_registro = ContratacionTerceros(
                                        documento=n,
                                        nombre=nombre_contratista,
                                        datos_completos=rows,
                                        resumen_calculado=resumen,
                                        reporte_ia=None # Lazy loading left for the API route
                                    )
                                    db.add(nuevo_registro)
                        except Exception as e:
                            print(f"Error fetching chunk for Export: {e}")
                db.commit()
            
            # 2. Build dictionaries for fast lookup
            # Terceros
            all_cached = db.query(ContratacionTerceros).filter(ContratacionTerceros.documento.in_(unique_nits)).all()
            terceros_dict = {r.documento: r for r in all_cached}
            
            # PDFs
            unique_llaves = df[llave_col].dropna().unique().tolist()
            pdfs_query = db.query(PDFsConsulta).filter(PDFsConsulta.llave_busqueda.in_(unique_llaves)).all()
            pdfs_dict = {}
            for p in pdfs_query:
                if p.llave_busqueda not in pdfs_dict:
                    pdfs_dict[p.llave_busqueda] = []
                pdfs_dict[p.llave_busqueda].append(p)
                
            # 3. Add columns to dataframe
            anexo_total = []
            anexo_valor = []
            anexo_primer = []
            anexo_ultimo = []
            anexo_ents = []
            anexo_cant_pdfs = []
            anexo_nombres_pdfs = []
            anexo_sha_pdfs = []
            
            for index, row in df.iterrows():
                nit = row.get(nit_col)
                llave = row.get(llave_col)
                
                # Tercero
                t = terceros_dict.get(nit)
                if t and t.resumen_calculado:
                    res = t.resumen_calculado
                    anexo_total.append(res.get("total_contratos", 0))
                    anexo_valor.append(res.get("valor_total", 0))
                    
                    hitos = res.get("hitos", {})
                    pc = hitos.get("primer_contrato")
                    uc = hitos.get("ultimo_contrato")
                    anexo_primer.append(pc.get("fecha") if pc else "N/A")
                    anexo_ultimo.append(uc.get("fecha") if uc else "N/A")
                    
                    ents = res.get("entidades_top", {})
                    anexo_ents.append(", ".join([f"{k} ({v})" for k, v in ents.items()]))
                else:
                    anexo_total.append(None)
                    anexo_valor.append(None)
                    anexo_primer.append(None)
                    anexo_ultimo.append(None)
                    anexo_ents.append(None)
                    
                # PDFs
                if llave_col:
                    pl = pdfs_dict.get(llave, [])
                    if pl:
                        p = pl[0]
                        anexo_cant_pdfs.append(p.cantidad_pdfs or 0)
                        nombres = p.lista_pdfs if isinstance(p.lista_pdfs, list) else []
                        anexo_nombres_pdfs.append(", ".join(nombres))
                        shas = p.sha256_pdfs if isinstance(p.sha256_pdfs, dict) else {}
                        anexo_sha_pdfs.append(", ".join(shas.values()))
                    else:
                        anexo_cant_pdfs.append(0)
                        anexo_nombres_pdfs.append("")
                        anexo_sha_pdfs.append("")
                else:
                    anexo_cant_pdfs.append(0)
                    anexo_nombres_pdfs.append("")
                    anexo_sha_pdfs.append("")
                
            df["anexo_total_contratos"] = anexo_total
            df["anexo_valor_total"] = anexo_valor
            df["anexo_fecha_primer_contrato"] = anexo_primer
            df["anexo_fecha_ultimo_contrato"] = anexo_ultimo
            df["anexo_lista_entidades"] = anexo_ents
            df["anexo_cantidad_pdfs"] = anexo_cant_pdfs
            df["anexo_nombres_pdfs"] = anexo_nombres_pdfs
            df["anexo_sha256_pdfs"] = anexo_sha_pdfs
            
        col_node_map = {}
        
        # If no columns specified, export everything
        if not req.columns:
            req.columns = list(FRONTEND_TO_SECOP.keys())
            if "informacion_anexa_tercero" not in req.columns:
                req.columns.append("informacion_anexa_tercero")
                
        if req.columns:
            ordered_target_cols = []
            seen = set()
            for toggle_key in req.columns:
                for col in FRONTEND_TO_SECOP.get(toggle_key, []):
                    if col not in seen:
                        ordered_target_cols.append(col)
                        col_node_map[col] = toggle_key
                        seen.add(col)
                
            ocr_columns = [c for c in df.columns if str(c).startswith("Resultado OCR ")]
            for ocr_col in ocr_columns:
                if ocr_col not in seen:
                    ordered_target_cols.append(ocr_col)
                    col_node_map[ocr_col] = "polizas"
                    seen.add(ocr_col)
                    
            valid_cols = [c for c in ordered_target_cols if c in df.columns]
            if valid_cols:
                df = df[valid_cols]

        monetary_cols = [c for c in df.columns if any(k in str(c).lower() for k in ['valor', 'saldo', 'precio'])]
        date_cols = [c for c in df.columns if 'fecha' in str(c).lower()]
        
        for col in monetary_cols:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
        for col in date_cols:
            df[col] = pd.to_datetime(df[col], errors='coerce')
            
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                try: df[col] = df[col].dt.tz_localize(None)
                except Exception: pass
            elif df[col].dtype == 'object':
                df[col] = df[col].apply(lambda x: str(x) if isinstance(x, (dict, list)) else x)
                
        for col in df.columns:
            if col not in monetary_cols and col not in date_cols:
                df[col] = df[col].astype(object)
                df[col] = df[col].fillna("NO DISPONIBLE")
                
        user_docs = os.path.join(os.path.expanduser('~'), 'Documents', 'SecopPRO_Consul', req.jobId)
        excel_dir = os.path.join(user_docs, 'Resultados_Excel')
        os.makedirs(excel_dir, exist_ok=True)
        
        filename = os.path.join(excel_dir, f"Reporte_SecopPRO_{uuid.uuid4().hex[:8]}.xlsx")
        
        writer = pd.ExcelWriter(filename, engine='xlsxwriter', datetime_format='yyyy-mm-dd')
        
        # --- WRITE MAIN SHEET ---
        df.to_excel(writer, index=False, sheet_name='Reporte SECOP', startrow=1)
        
        workbook  = writer.book
        worksheet = writer.sheets['Reporte SECOP']
        
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
            
        no_disp_format = workbook.add_format({'font_color': '#ef4444', 'bold': True})
        url_format = workbook.add_format({'font_color': 'blue', 'underline': 1, 'border': 1, 'border_color': '#e5e7eb'})
        
        current_node = None
        start_col = 0
        for i, col in enumerate(df.columns):
            node_key = col_node_map.get(col, None)
            if node_key != current_node:
                if current_node is not None:
                    title = NODE_META.get(current_node, {}).get("title", "Otros")
                    color = NODE_META.get(current_node, {}).get("color", "#ffffff")
                    super_fmt = get_format(bg_color=color, is_super=True)
                    if start_col == i - 1: worksheet.write(0, start_col, title, super_fmt)
                    else: worksheet.merge_range(0, start_col, 0, i - 1, title, super_fmt)
                current_node = node_key
                start_col = i
                
        if current_node is not None:
            title = NODE_META.get(current_node, {}).get("title", "Otros")
            color = NODE_META.get(current_node, {}).get("color", "#ffffff")
            super_fmt = get_format(bg_color=color, is_super=True)
            if start_col == len(df.columns) - 1: worksheet.write(0, start_col, title, super_fmt)
            else: worksheet.merge_range(0, start_col, 0, len(df.columns) - 1, title, super_fmt)
                
        # Encuentra la col de NIT para los hyperlinks
        main_nit_col_idx = None
        if include_anexo:
            for i, col in enumerate(df.columns):
                if col in FRONTEND_TO_SECOP["nit_entidad"]:
                    main_nit_col_idx = i
                    break
                    
        for i, col in enumerate(df.columns):
            node_key = col_node_map.get(col, None)
            color = NODE_META.get(node_key, {}).get("color", "#ffffff") if node_key else "#ffffff"
            
            header_fmt = get_format(bg_color=color, is_header=True)
            worksheet.write(1, i, col, header_fmt)
            
            num_fmt = None
            if col in monetary_cols: num_fmt = '$#,##0.00'
            elif col in date_cols: num_fmt = 'yyyy-mm-dd'
                
            col_fmt = get_format(bg_color=color, num_format=num_fmt)
            
            max_len = max(df[col].astype(str).map(len).max(), len(str(col))) + 2
            worksheet.set_column(i, i, min(max_len, 50), col_fmt)
            
        worksheet.conditional_format(2, 0, len(df)+1, len(df.columns)-1, {
            'type': 'cell', 'criteria': '==', 'value': '"NO DISPONIBLE"', 'format': no_disp_format
        })
        
        # Escribir Hipervínculos
        if main_nit_col_idx is not None and include_anexo:
            # Check if terceros_dict is available here (it should be since it's instantiated above if info is requested)
            if 'terceros_dict' in locals():
                for row_idx, row in enumerate(df.itertuples(index=False)):
                    nit_val = row[main_nit_col_idx]
                    if nit_val and str(nit_val) != "NO DISPONIBLE" and str(nit_val) in terceros_dict:
                        sheet_name_clean = re.sub(r'[\\/*?:\[\]]', '_', str(nit_val))[:31]
                        worksheet.write_url(row_idx + 2, main_nit_col_idx, f"internal:'{sheet_name_clean}'!A1", string=str(nit_val), cell_format=url_format)
                    
        worksheet.freeze_panes(2, 0)
        
        # --- WRITE SUB-SHEETS FOR EACH CONTRACTOR ---
        if include_anexo and 'terceros_dict' in locals():
            for nit, tercero_obj in terceros_dict.items():
                sheet_name = re.sub(r'[\\/*?:\[\]]', '_', str(nit))[:31]
                if not tercero_obj.datos_completos: continue
                
                df_sub = pd.DataFrame(tercero_obj.datos_completos)
                
                # Identificar y convertir columnas numéricas y de fecha
                sub_monetary = [c for c in df_sub.columns if any(k in str(c).lower() for k in ['valor', 'saldo', 'precio'])]
                sub_date = [c for c in df_sub.columns if 'fecha' in str(c).lower()]
                
                for col in sub_monetary: df_sub[col] = pd.to_numeric(df_sub[col], errors='coerce')
                for col in sub_date: df_sub[col] = pd.to_datetime(df_sub[col], errors='coerce')
                    
                for col in df_sub.columns:
                    if pd.api.types.is_datetime64_any_dtype(df_sub[col]):
                        try: df_sub[col] = df_sub[col].dt.tz_localize(None)
                        except: pass
                    elif df_sub[col].dtype == 'object':
                        df_sub[col] = df_sub[col].apply(lambda x: str(x) if isinstance(x, (dict, list)) else x)
                        
                for col in df_sub.columns:
                    if col not in sub_monetary and col not in sub_date:
                        df_sub[col] = df_sub[col].astype(object)
                        df_sub[col] = df_sub[col].fillna("")
                        
                df_sub.to_excel(writer, index=False, sheet_name=sheet_name)
                sub_worksheet = writer.sheets[sheet_name]
                
                # Formato Premium Sub-hoja
                header_sub_fmt = workbook.add_format({
                    'bg_color': '#f3e8ff', # Pastel purple
                    'bold': True, 'align': 'center', 'valign': 'vcenter', 'border': 1, 'font_color': '#374151'
                })
                
                zebra_fmt_0 = workbook.add_format({'bg_color': '#ffffff', 'border': 1, 'border_color': '#f3f4f6'})
                zebra_fmt_1 = workbook.add_format({'bg_color': '#f9fafb', 'border': 1, 'border_color': '#f3f4f6'})
                zebra_fmt_0_curr = workbook.add_format({'bg_color': '#ffffff', 'border': 1, 'border_color': '#f3f4f6', 'num_format': '$#,##0.00'})
                zebra_fmt_1_curr = workbook.add_format({'bg_color': '#f9fafb', 'border': 1, 'border_color': '#f3f4f6', 'num_format': '$#,##0.00'})
                zebra_fmt_0_date = workbook.add_format({'bg_color': '#ffffff', 'border': 1, 'border_color': '#f3f4f6', 'num_format': 'yyyy-mm-dd'})
                zebra_fmt_1_date = workbook.add_format({'bg_color': '#f9fafb', 'border': 1, 'border_color': '#f3f4f6', 'num_format': 'yyyy-mm-dd'})
                
                for i, col in enumerate(df_sub.columns):
                    sub_worksheet.write(0, i, col, header_sub_fmt)
                    
                    max_len_sub = max(df_sub[col].astype(str).map(len).max(), len(str(col))) + 2
                    sub_worksheet.set_column(i, i, min(max_len_sub, 40))
                    
                    # Apply zebra by row
                    for r_idx in range(len(df_sub)):
                        val = df_sub.iloc[r_idx, i]
                        is_odd = r_idx % 2 != 0
                        
                        if col in sub_monetary:
                            fmt = zebra_fmt_1_curr if is_odd else zebra_fmt_0_curr
                        elif col in sub_date:
                            fmt = zebra_fmt_1_date if is_odd else zebra_fmt_0_date
                        else:
                            fmt = zebra_fmt_1 if is_odd else zebra_fmt_0
                            
                        # Handle NaT/NaN
                        if pd.isna(val) or str(val).strip() == "":
                            sub_worksheet.write_blank(r_idx + 1, i, "", fmt)
                        elif col in sub_date:
                            # Convert to datetime object for xlsxwriter
                            sub_worksheet.write_datetime(r_idx + 1, i, val, fmt)
                        else:
                            sub_worksheet.write(r_idx + 1, i, val, fmt)
                
                sub_worksheet.freeze_panes(1, 0)
        
        writer.close()
        
        return FileResponse(filename, filename="Reporte_SecopPRO.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno al exportar: {str(e)}")

@router.get("/zip/{jobId}/{id_contrato}")
def download_zip(jobId: str, id_contrato: str):
    user_docs = os.path.join(os.path.expanduser('~'), 'Documents', 'SecopPRO_Consul', jobId, 'DocumentosDescargados')
    os.makedirs(user_docs, exist_ok=True)
    zip_path = os.path.join(user_docs, f"{id_contrato}.zip")
    
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="El archivo ZIP aún no ha sido generado por el Scraper de SECOP II. Por favor espera unos momentos.")
        
    return FileResponse(zip_path, filename=f"{id_contrato}.zip", media_type="application/zip")
