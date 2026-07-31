import asyncio
import os
import aiohttp
from playwright.async_api import async_playwright

STATE_FILE = "secop_session.json"

async def test_interactive_captcha():
    print("1. Consultando API para obtener URL...")
    url_socrata = "https://www.datos.gov.co/resource/jbjy-vk9h.json?id_contrato=CO1.PCCNTR.9438934"
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as session:
        async with session.get(url_socrata) as resp:
            data = await resp.json()
            urlproceso = data[0].get("urlproceso")
            if isinstance(urlproceso, dict):
                urlproceso = urlproceso.get("url", "N/A")
            urlproceso_limpia = urlproceso.replace("&isModal=true", "").replace("&asPopupView=true", "")
            print(f"URL: {urlproceso_limpia}")
            
    print("2. Iniciando Playwright para Captura de Sesión...")
    
    async with async_playwright() as p:
        print("[!] Abriendo ventana visible para resolver ReCaptcha...")
        
        context_args = {
            'viewport': {'width': 1280, 'height': 720},
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        if os.path.exists(STATE_FILE):
            print("(Usando cookies de sesión anteriores para evitar ReCaptcha si aún son válidas)")
            context_args['storage_state'] = STATE_FILE

        browser = await p.chromium.launch(
            headless=False,
            args=['--ignore-certificate-errors', '--disable-blink-features=AutomationControlled']
        )
        context = await browser.new_context(**context_args)
        page = await context.new_page()
        
        await page.goto(urlproceso_limpia)
        
        print("Esperando a que el usuario resuelva el Captcha...")
        print(">>> POR FAVOR, PRESIONA LA TECLA 'ENTER' EN ESTA CONSOLA CUANDO LA PÁGINA DEL CONTRATO HAYA CARGADO <<<")
        await asyncio.get_event_loop().run_in_executor(None, input, "")
        
        print("Guardando cookies de sesión autorizada...")
        await context.storage_state(path=STATE_FILE)
        await browser.close()
        
        print("\n3. Prueba de Background (Headless) con sesión robada...")
        browser_bg = await p.chromium.launch(
            headless=True,
            args=['--ignore-certificate-errors', '--disable-blink-features=AutomationControlled']
        )
        context_bg = await browser_bg.new_context(
            storage_state=STATE_FILE,
            viewport={'width': 1280, 'height': 720},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page_bg = await context_bg.new_page()
        
        print("Navegando invisiblemente...")
        await page_bg.goto(urlproceso_limpia, wait_until="domcontentloaded")
        await page_bg.wait_for_timeout(5000)
        
        title_bg = await page_bg.title()
        print(f"Título en Background: {title_bg}")
        
        links = await page_bg.locator("a").all()
        print(f"Total enlaces encontrados en Background: {len(links)}")
        
        # Lógica para descargar físicamente los PDFs
        pruebas_dir = os.path.join(os.getcwd(), "PRUEBAS")
        if not os.path.exists(pruebas_dir):
            os.makedirs(pruebas_dir)
            
        print(f"Buscando botones de descarga...")
        download_links = await page_bg.locator("a[id^='lnkDownloadLink']").all()
        print(f"¡Se encontraron {len(download_links)} documentos para descargar!")
        
        for i, link in enumerate(download_links):
            print(f"Descargando documento {i+1} de {len(download_links)}...")
            try:
                # Esperamos que se dispare el evento de descarga al hacer clic
                async with page_bg.expect_download(timeout=30000) as download_info:
                    await link.click(force=True)
                download = await download_info.value
                
                # Nombre original sugerido por el servidor
                file_name = download.suggested_filename
                save_path = os.path.join(pruebas_dir, file_name)
                
                print(f"   -> Guardando en: {save_path}")
                await download.save_as(save_path)
            except Exception as e:
                print(f"   -> Error descargando doc {i+1}: {e}")
                
        await browser_bg.close()
        print("¡Prueba de Human-in-the-Loop y Descarga COMPLETADA!")

if __name__ == "__main__":
    asyncio.run(test_interactive_captcha())
