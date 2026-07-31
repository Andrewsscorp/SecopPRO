import os
import zipfile
import asyncio
import pathlib
import shutil
from playwright.async_api import async_playwright

import sys
import threading
import concurrent.futures

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "secop_session.json")

async def authenticate_human_in_the_loop(urlproceso: str, log_queue: asyncio.Queue, state_file: str):
    """
    Lanza una ventana visible para que el usuario resuelva el ReCaptcha.
    """
    await log_queue.put({"type": "log", "message": "⚠️ [ANTI-BOT] SECOP II requiere validación manual (ReCaptcha). Abriendo ventana..."})
    
    # Esta función se ejecutará en el thread separado, por lo que NO podemos hacer `await log_queue.put()` directamente.
    # Ah, espera, la función asíncrona es llamada desde el main loop o el thread?
    pass # Reescrito abajo

# Función síncrona que correrá en el thread
def run_playwright_isolated(job_id, llave, urlproceso_limpia, raw_dir, zip_path, max_retries, state_file, main_loop, log_queue):
    # Forzar el uso del ProactorEventLoop en este hilo (Obligatorio en Windows)
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    thread_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(thread_loop)
    
    # Helper para enviar logs a la cola del loop principal
    def send_log(msg_type, message):
        asyncio.run_coroutine_threadsafe(log_queue.put({"type": msg_type, "message": message}), main_loop)

    async def _internal_scraper():
        send_log("log", f"[SCRAPER] 🚀 Iniciando extracción física aislada para '{llave}'...")
        for attempt in range(max_retries):
            try:
                async with async_playwright() as p:
                    context_args = {
                        'accept_downloads': True,
                        'viewport': {'width': 1280, 'height': 720},
                        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                    if os.path.exists(state_file):
                        send_log("log", "[SCRAPER] 🔑 Inyectando cookies de sesión robadas previamente...")
                        context_args['storage_state'] = state_file
                        
                    send_log("log", "[SCRAPER] 🌐 Lanzando navegador invisible de Chromium...")
                    browser = await p.chromium.launch(
                        headless=True,
                        args=['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
                    )
                    context = await browser.new_context(**context_args)
                    page = await context.new_page()
                    page.set_default_timeout(60000)
                    
                    send_log("log", "[SCRAPER] ⏳ Entrando a SECOP II. Analizando la defensa (espera ~10s)...")
                    await page.goto(urlproceso_limpia, wait_until="domcontentloaded")
                    await page.wait_for_timeout(6000)
                    
                    title = await page.title()
                    if "ReCaptcha" in title or "Just a moment" in title:
                        await browser.close()
                        send_log("log", "⚠️ [ANTI-BOT] SECOP detectó el robot. ¡ABRIENDO VENTANA INTERACTIVA!")
                        # Iniciar flujo interactivo
                        browser_int = await p.chromium.launch(headless=False, args=['--ignore-certificate-errors', '--disable-blink-features=AutomationControlled'])
                        ctx_int = await browser_int.new_context(**context_args)
                        page_int = await ctx_int.new_page()
                        send_log("log", "👉 [ANTI-BOT] Ventana abierta. Por favor, resuelve el ReCaptcha...")
                        await page_int.goto(urlproceso_limpia, wait_until="domcontentloaded")
                        
                        intentos = 0
                        capturado = False
                        while intentos < 120 and not page_int.is_closed():
                            if not capturado:
                                try:
                                    if await page_int.locator("a[id^='lnkDownloadLink']").count() > 0 or await page_int.locator("text='Imprimir'").count() > 0:
                                        await ctx_int.storage_state(path=state_file)
                                        send_log("log", "✅ ¡ReCaptcha superado! Cierra la ventana de Chrome para continuar.")
                                        capturado = True
                                except: pass
                            await asyncio.sleep(2)
                            intentos += 1
                            
                        if not capturado:
                            raise Exception("Tiempo agotado o ventana cerrada sin resolver ReCaptcha.")
                            
                        if browser_int.is_connected:
                            await browser_int.close()
                            
                        raise Exception("ReCaptcha interceptado y resuelto. Reiniciando worker headless...")
                    
                    # Aceptar cualquier alerta o diálogo (pop-up) que bloquee la página
                    page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))

                    # Selectores universales de SECOP para descargas de anexos (Licitaciones y Contratos)
                    selector_principal = "a[id^='lnkDownloadLink'], a[onclick*='DownloadFile'], a[onclick*='DownloadDocument']"
                    locator_principal = page.locator(selector_principal)
                    total_links = await locator_principal.count()
                    pdf_count = 0
                    
                    import random
                    consecutive_errors = 0

                    if total_links > 0:
                        send_log("log", f"[SCRAPER] 📁 ¡Se encontraron {total_links} documentos con el selector principal!")
                        for i in range(total_links):
                            try:
                                # Retardo aleatorio para evadir Rate-Limiting de SECOP
                                delay = random.uniform(2.0, 4.5)
                                await asyncio.sleep(delay)
                                
                                send_log("log", f"[SCRAPER] ⬇️ Descargando documento {i+1} de {total_links} (delay {delay:.1f}s)...")
                                link = locator_principal.nth(i)
                                # Timeout a 90s, JS click
                                async with page.expect_download(timeout=90000) as download_info:
                                    await link.evaluate("el => el.click()")
                                download = await download_info.value
                                safe_name = download.suggested_filename
                                if '.' not in safe_name: safe_name += ".pdf"
                                await download.save_as(raw_dir / safe_name)
                                pdf_count += 1
                                consecutive_errors = 0
                                send_log("log", f"[SCRAPER] ✅ Guardado: {safe_name}")
                            except Exception as e_descarga: 
                                consecutive_errors += 1
                                send_log("log", f"[SCRAPER] ⚠️ Falló descarga de doc {i+1}: {str(e_descarga)[:80]}")
                                if consecutive_errors >= 3:
                                    send_log("log", f"[SCRAPER AVISO] SECOP bloqueó las descargas (Rate-Limit). Pausando 10 segundos...")
                                    await asyncio.sleep(10)
                                    # Intentar refrescar la página puede corromper el DOM, mejor solo pausar
                                    consecutive_errors = 0
                                continue
                    else:
                        # Fallback extremo para cualquier enlace que parezca un documento
                        fallback_links_locator = page.locator("a")
                        total_fallback_elements = await fallback_links_locator.count()
                        valid_fallbacks_indices = []
                        
                        for i in range(total_fallback_elements):
                            try:
                                link = fallback_links_locator.nth(i)
                                href = await link.get_attribute("href") or ""
                                onclick = await link.get_attribute("onclick") or ""
                                text = await link.inner_text()
                                if (".pdf" in href.lower() or 
                                    ".pdf" in text.lower() or 
                                    "descargar" in text.lower() or 
                                    "download" in href.lower() or
                                    "download" in onclick.lower()):
                                    valid_fallbacks_indices.append(i)
                            except: continue
                            
                        total_fallbacks = len(valid_fallbacks_indices)
                        if total_fallbacks > 0:
                            send_log("log", f"[SCRAPER] 📁 Buscando en {total_fallbacks} enlaces alternativos...")
                            for i, idx in enumerate(valid_fallbacks_indices):
                                try:
                                    send_log("log", f"[SCRAPER] ⬇️ Descargando alternativo {i+1} de {total_fallbacks}...")
                                    link = fallback_links_locator.nth(idx)
                                    async with page.expect_download(timeout=90000) as download_info:
                                        await link.evaluate("el => el.click()")
                                    download = await download_info.value
                                    safe_name = download.suggested_filename
                                    if '.' not in safe_name: safe_name += ".pdf"
                                    await download.save_as(raw_dir / safe_name)
                                    pdf_count += 1
                                    send_log("log", f"[SCRAPER] ✅ Guardado: {safe_name}")
                                except: continue
                                
                    await browser.close()
                    
                    if pdf_count > 0:
                        with zipfile.ZipFile(zip_path, 'w') as zf:
                            for file_name in os.listdir(raw_dir):
                                zf.write(raw_dir / file_name, arcname=file_name)
                        send_log("log", f"[SCRAPER OK] {pdf_count} anexos descargados en ZIP para '{llave}'.")
                    else:
                        with zipfile.ZipFile(zip_path, 'w') as zf:
                            zf.writestr("alerta.txt", b"No se encontraron anexos fisicos descargables.")
                        send_log("log", f"[SCRAPER AVISO] No se encontraron anexos en '{llave}'.")
                        
                    break # Salir del loop de reintentos
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                error_str = str(e).replace('\n', ' ')
                if "ReCaptcha" not in error_str and "ReCaptcha" not in error_details:
                    if attempt == max_retries - 1:
                        send_log("log", f"[SCRAPER WARNING] Fallo final en '{llave}': {error_str} | TRACE: {error_details[-100:]}")
                    else:
                        send_log("log", f"[SCRAPER REINTENTO] Latencia ({error_str[:80]})...")
                await asyncio.sleep(2)
                
    try:
        thread_loop.run_until_complete(_internal_scraper())
    finally:
        thread_loop.close()


async def download_pdfs_for_contract(job_id: str, llave: str, urlproceso: str, log_queue: asyncio.Queue, max_retries: int = 3):
    """
    Controlador asíncrono para ejecutar el scraper aislado.
    Crea los directorios necesarios y lanza el hilo.
    """
    if isinstance(urlproceso, dict):
        urlproceso = urlproceso.get("url", "N/A")
    if not urlproceso or urlproceso == "N/A" or not str(urlproceso).startswith("http"):
        await log_queue.put({"type": "log", "message": f"[SCRAPER INFO] '{llave}' no tiene URL válida."})
        return

    # Usar la URL original completa (los parámetros como noticeUID son OBLIGATORIOS en SECOP)
    urlproceso_limpia = urlproceso
    
    # Sanitizar la llave para que sea válida en el sistema de archivos de Windows
    import re
    llave_safe = re.sub(r'[\\/*?:"<>|]', '_', llave)

    user_docs = pathlib.Path(os.path.expanduser('~')) / 'Documents' / 'SecopPRO_Consul' / job_id
    raw_dir = user_docs / 'DocumentosDescargados' / f"raw_{llave_safe}"
    zip_path = user_docs / 'DocumentosDescargados' / f"{llave_safe}.zip"
    
    if zip_path.exists():
        if raw_dir.exists(): shutil.rmtree(raw_dir)
        return
        
    # Crear carpetas si no existen
    raw_dir.mkdir(parents=True, exist_ok=True)
    zip_path.parent.mkdir(parents=True, exist_ok=True)
        
    main_loop = asyncio.get_running_loop()
    
    # Delegar la extracción a un hilo con su propio ProactorEventLoop
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        await main_loop.run_in_executor(
            executor, 
            run_playwright_isolated, 
            job_id, llave, urlproceso_limpia, raw_dir, zip_path, max_retries, STATE_FILE, main_loop, log_queue
        )
    
    if raw_dir.exists():
        shutil.rmtree(raw_dir)
