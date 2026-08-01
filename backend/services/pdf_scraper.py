import os
import re
import sys
import random
import zipfile
import asyncio
import pathlib
import shutil
import concurrent.futures
from typing import Optional

from playwright.async_api import async_playwright

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "secop_session.json")

# Límite independiente al de reintentos por error real: cada vez que se resuelve
# un ReCaptcha se reinicia el worker, pero eso NO debe consumir el presupuesto
# de max_retries (antes ambos compartían el mismo contador).
MAX_CAPTCHA_RESTARTS = 6

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _nombre_archivo_seguro(nombre: str) -> str:
    """Sanitiza un nombre de archivo sugerido por el servidor para que sea
    válido en el sistema de archivos (Windows y otros)."""
    limpio = re.sub(r'[\\/*?:"<>|]', "_", nombre or "documento")
    if "." not in limpio:
        limpio += ".pdf"
    return limpio


def _extraer_url_getaction(onclick_attr: str) -> Optional[str]:
    """Extrae la URL real de descarga desde un atributo onclick tipo
    getAction('...', '...') propio de SECOP II. Devuelve None si no aplica."""
    if not onclick_attr or "getAction" not in onclick_attr:
        return None
    partes = re.findall(r"'([^']+)'", onclick_attr)
    if not partes:
        return None
    url_path = "".join(partes).replace("&amp;", "&")
    if url_path.startswith("http"):
        return url_path
    return "https://community.secop.gov.co" + url_path


async def _intentar_descarga(link, page, raw_dir: pathlib.Path) -> str:
    """Descarga un único documento a partir de su locator. Intenta primero
    extraer la URL real del onclick (más confiable), y si no puede, recurre
    al click forzado. Lanza excepción si la descarga falla; el llamador
    decide cómo manejarla. Devuelve el nombre de archivo guardado."""
    onclick_attr = await link.get_attribute("onclick") or ""
    extracted_url = _extraer_url_getaction(onclick_attr)

    if extracted_url:
        async with page.expect_download(timeout=90000) as download_info:
            await page.evaluate("""(url) => {
                const a = document.createElement('a');
                a.href = url;
                a.download = ''; // Forza la descarga sin abrir pestañas ni recargar el DOM
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }""", extracted_url)
        download = await download_info.value
    else:
        async with page.expect_download(timeout=90000) as download_info:
            await link.evaluate("el => el.click()")
        download = await download_info.value

    safe_name = _nombre_archivo_seguro(download.suggested_filename)
    await download.save_as(raw_dir / safe_name)
    return safe_name


def run_playwright_isolated(job_id, llave, urlproceso_limpia, raw_dir, zip_path,
                             max_retries, state_file, main_loop, log_queue,
                             active_cancellations):
    # Forzar el uso de ProactorEventLoop en Windows. Se comprueba primero la
    # política actual para no mutar el estado global del proceso si ya está
    # configurada (esto corre en un hilo secundario, no en el hilo principal).
    if sys.platform == "win32" and not isinstance(
        asyncio.get_event_loop_policy(), asyncio.WindowsProactorEventLoopPolicy
    ):
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    thread_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(thread_loop)

    def send_log(msg_type, message):
        asyncio.run_coroutine_threadsafe(
            log_queue.put({"type": msg_type, "message": message}), main_loop
        )

    async def _internal_scraper():
        # Tareas en segundo plano (aceptar diálogos) — se retienen aquí para
        # que el garbage collector no las destruya a medio ejecutar.
        background_tasks: set = set()

        def _manejar_dialogo(dialog):
            task = asyncio.create_task(dialog.accept())
            background_tasks.add(task)
            task.add_done_callback(background_tasks.discard)

        send_log("log", f"[SCRAPER] 🚀 Iniciando extracción física aislada para '{llave}'...")

        attempt = 0
        captcha_restarts = 0

        while attempt < max_retries:
            try:
                async with async_playwright() as p:
                    context_args = {
                        "accept_downloads": True,
                        "viewport": {"width": 1280, "height": 720},
                        "user_agent": USER_AGENT,
                    }
                    if os.path.exists(state_file):
                        send_log("log", "[SCRAPER] 🔑 Inyectando cookies de sesión previamente guardadas...")
                        context_args["storage_state"] = state_file

                    send_log("log", "[SCRAPER] 🌐 Lanzando navegador invisible de Chromium...")
                    browser = await p.chromium.launch(
                        headless=True,
                        args=[
                            "--disable-blink-features=AutomationControlled",
                            "--no-sandbox",
                            "--disable-setuid-sandbox",
                            # Necesario por problemas de cadena de certificados en
                            # community.secop.gov.co; decisión consciente, no un descuido.
                            "--ignore-certificate-errors",
                        ],
                    )
                    context = await browser.new_context(**context_args)
                    page = await context.new_page()
                    page.set_default_timeout(60000)
                    page.on("dialog", _manejar_dialogo)

                    send_log("log", "[SCRAPER] ⏳ Entrando a SECOP II. Analizando la defensa (espera ~10s)...")
                    await page.goto(urlproceso_limpia, wait_until="domcontentloaded")
                    await page.wait_for_timeout(6000)

                    title = await page.title()
                    if "ReCaptcha" in title or "Just a moment" in title:
                        await browser.close()
                        send_log("log", "⚠️ [ANTI-BOT] SECOP detectó el robot. ¡ABRIENDO VENTANA INTERACTIVA!")

                        browser_int = await p.chromium.launch(
                            headless=False,
                            args=["--ignore-certificate-errors", "--disable-blink-features=AutomationControlled"],
                        )
                        ctx_int = await browser_int.new_context(**context_args)
                        page_int = await ctx_int.new_page()
                        page_int.on("dialog", _manejar_dialogo)

                        send_log("log", "👉 [ANTI-BOT] Ventana abierta. Por favor, resuelve el ReCaptcha...")
                        await page_int.goto(urlproceso_limpia, wait_until="domcontentloaded")

                        intentos = 0
                        capturado = False
                        while intentos < 120 and not page_int.is_closed():
                            if not capturado:
                                try:
                                    if (await page_int.locator("a[id^='lnkDownloadLink']").count() > 0
                                            or await page_int.locator("text='Imprimir'").count() > 0):
                                        await ctx_int.storage_state(path=state_file)
                                        send_log("log", "✅ ¡ReCaptcha superado! Cierra la ventana de Chrome para continuar.")
                                        capturado = True
                                except Exception:
                                    pass
                            await asyncio.sleep(2)
                            intentos += 1

                        if browser_int.is_connected():
                            await browser_int.close()

                        if not capturado:
                            # Fallo real: cuenta como intento normal.
                            raise TimeoutError("Tiempo agotado o ventana cerrada sin resolver ReCaptcha.")

                        captcha_restarts += 1
                        if captcha_restarts > MAX_CAPTCHA_RESTARTS:
                            raise RuntimeError(
                                "Demasiados reinicios por ReCaptcha sin lograr completar la descarga."
                            )
                        send_log("log", "[SCRAPER] 🔁 Sesión guardada. Reiniciando worker headless con cookies nuevas...")
                        continue  # No incrementa 'attempt': esto no es un fallo real.

                    selector_principal = (
                        "a[id^='lnkDownloadLink'], a[onclick*='DownloadFile'], a[onclick*='DownloadDocument']"
                    )
                    
                    anchors_info = await page.evaluate(f"""() => Array.from(document.querySelectorAll("{selector_principal}")).map((a, i) => ({{
                        id: a.id || '',
                        index: i
                    }}))""")
                    
                    total_links = len(anchors_info)
                    pdf_count = 0
                    consecutive_errors = 0

                    if total_links > 0:
                        send_log("log", f"[SCRAPER] 📁 ¡Se encontraron {total_links} documentos con el selector principal!")
                        for i, info in enumerate(anchors_info):
                            if job_id in active_cancellations:
                                raise asyncio.CancelledError("Interrumpido por el usuario en medio de la descarga.")

                            delay = random.uniform(2.0, 4.5)
                            await asyncio.sleep(delay)
                            send_log("log", f"[SCRAPER] ⬇️ Descargando documento {i + 1} de {total_links} (delay {delay:.1f}s)...")

                            try:
                                if info['id']:
                                    link = page.locator(f"id={info['id']}")
                                else:
                                    link = page.locator(selector_principal).nth(info['index'])
                                
                                await link.wait_for(state="attached", timeout=10000)
                                safe_name = await _intentar_descarga(link, page, raw_dir)
                                pdf_count += 1
                                consecutive_errors = 0
                                send_log("log", f"[SCRAPER] ✅ Guardado: {safe_name}")
                            except Exception as e_descarga:
                                consecutive_errors += 1
                                send_log("log", f"[SCRAPER] ⚠️ Falló descarga de doc {i + 1}: {str(e_descarga)[:80]}")
                                if consecutive_errors >= 3:
                                    send_log("log", "[SCRAPER AVISO] SECOP bloqueó las descargas (Rate-Limit). Pausando 10 segundos...")
                                    await asyncio.sleep(10)
                                    consecutive_errors = 0
                                continue
                    else:
                        # Extracción en bloque (un solo evaluate) en vez de recorrer
                        # cada <a> con múltiples awaits individuales — mucho más rápido
                        # en páginas con muchos enlaces.
                        anchors_info = await page.evaluate(
                            """() => Array.from(document.querySelectorAll('a')).map((a, i) => ({
                                href: a.getAttribute('href') || '',
                                onclick: a.getAttribute('onclick') || '',
                                text: (a.innerText || '').trim(),
                                id: a.id || '',
                                index: i
                            }))"""
                        )
                        valid_fallbacks = [
                            info for info in anchors_info
                            if ".pdf" in info["href"].lower()
                            or ".pdf" in info["text"].lower()
                            or "descargar" in info["text"].lower()
                            or "download" in info["href"].lower()
                            or "download" in info["onclick"].lower()
                        ]

                        total_fallbacks = len(valid_fallbacks)
                        if total_fallbacks > 0:
                            send_log("log", f"[SCRAPER] 📁 Buscando en {total_fallbacks} enlaces alternativos...")
                            for i, info in enumerate(valid_fallbacks):
                                if job_id in active_cancellations:
                                    raise asyncio.CancelledError("Interrumpido por el usuario en medio de la descarga.")
                                try:
                                    send_log("log", f"[SCRAPER] ⬇️ Descargando alternativo {i + 1} de {total_fallbacks}...")
                                    if info['id']:
                                        link = page.locator(f"id={info['id']}")
                                    else:
                                        link = page.locator("a").nth(info['index'])
                                    
                                    await link.wait_for(state="attached", timeout=10000)
                                    safe_name = await _intentar_descarga(link, page, raw_dir)
                                    pdf_count += 1
                                    send_log("log", f"[SCRAPER] ✅ Guardado: {safe_name}")
                                except Exception as e_fallback:
                                    send_log("log", f"[SCRAPER] ⚠️ Falló alternativo {i + 1}: {str(e_fallback)[:80]}")
                                    continue

                    await browser.close()

                    if pdf_count > 0:
                        with zipfile.ZipFile(zip_path, "w") as zf:
                            for file_name in os.listdir(raw_dir):
                                zf.write(raw_dir / file_name, arcname=file_name)
                        send_log("log", f"[SCRAPER OK] {pdf_count} anexos descargados en ZIP para '{llave}'.")
                    else:
                        # Ruta dinámica derivada de zip_path (antes apuntaba a una
                        # ruta fija de un usuario específico, rompía en cualquier
                        # otra máquina). Un nombre por llave evita sobrescribir
                        # capturas de otros contratos fallidos en el mismo job.
                        debug_path = zip_path.parent / f"debug_{zip_path.stem}.png"
                        try:
                            await page.screenshot(path=str(debug_path))
                        except Exception:
                            pass
                        with zipfile.ZipFile(zip_path, "w") as zf:
                            zf.writestr("alerta.txt", b"No se encontraron anexos fisicos descargables.")
                        send_log("log", f"[SCRAPER AVISO] No se encontraron anexos en '{llave}'. (Screenshot: {debug_path})")

                    break  # Éxito: sale del bucle de reintentos.

            except asyncio.CancelledError:
                send_log("log", "[SCRAPER AVISO] Empaquetando los PDFs que se alcanzaron a descargar antes de cancelar...")
                if os.path.isdir(raw_dir) and any(raw_dir.iterdir()):
                    with zipfile.ZipFile(zip_path, "w") as zf:
                        for file_name in os.listdir(raw_dir):
                            zf.write(raw_dir / file_name, arcname=file_name)
                    send_log("log", f"[SCRAPER OK] Anexos rescatados en ZIP para '{llave}'.")
                raise
            except Exception as e:
                attempt += 1
                error_str = str(e).replace("\n", " ")
                if attempt >= max_retries:
                    import traceback
                    send_log("log", f"[SCRAPER WARNING] Fallo final en '{llave}': {error_str} | TRACE: {traceback.format_exc()[-200:]}")
                else:
                    send_log("log", f"[SCRAPER REINTENTO] ({attempt}/{max_retries}) {error_str[:80]}")
                await asyncio.sleep(2)

    try:
        thread_loop.run_until_complete(_internal_scraper())
    finally:
        thread_loop.close()


async def download_pdfs_for_contract(job_id: str, llave: str, urlproceso, log_queue: asyncio.Queue,
                                      max_retries: int = 3, active_cancellations: set = None):
    """Controlador asíncrono para ejecutar el scraper aislado. Crea los
    directorios necesarios y lanza el hilo."""
    if isinstance(urlproceso, dict):
        urlproceso = urlproceso.get("url", "N/A")
    if not urlproceso or urlproceso == "N/A" or not str(urlproceso).startswith("http"):
        await log_queue.put({"type": "log", "message": f"[SCRAPER INFO] '{llave}' no tiene URL válida."})
        return

    urlproceso_limpia = urlproceso
    llave_safe = re.sub(r'[\\/*?:"<>|]', "_", llave)

    user_docs = pathlib.Path(os.path.expanduser("~")) / "Documents" / "SecopPRO_Consul" / job_id
    raw_dir = user_docs / "DocumentosDescargados" / f"raw_{llave_safe}"
    zip_path = user_docs / "DocumentosDescargados" / f"{llave_safe}.zip"

    if zip_path.exists():
        if raw_dir.exists():
            shutil.rmtree(raw_dir)
        return

    raw_dir.mkdir(parents=True, exist_ok=True)
    zip_path.parent.mkdir(parents=True, exist_ok=True)

    main_loop = asyncio.get_running_loop()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        await main_loop.run_in_executor(
            executor,
            run_playwright_isolated,
            job_id, llave, urlproceso_limpia, raw_dir, zip_path, max_retries,
            STATE_FILE, main_loop, log_queue, active_cancellations or set(),
        )

    if raw_dir.exists():
        shutil.rmtree(raw_dir)
