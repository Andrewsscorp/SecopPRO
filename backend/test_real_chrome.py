import asyncio
import os
import aiohttp
from playwright.async_api import async_playwright
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

async def test_real_chrome():
    print("1. Obteniendo URL de Socrata...")
    url_socrata = "https://www.datos.gov.co/resource/jbjy-vk9h.json?id_contrato=CO1.PCCNTR.9438934"
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as session:
        async with session.get(url_socrata) as resp:
            data = await resp.json()
            urlproceso = data[0].get("urlproceso")
            if isinstance(urlproceso, dict):
                urlproceso = urlproceso.get("url", "N/A")
            urlproceso_limpia = urlproceso.replace("&isModal=true", "").replace("&asPopupView=true", "")
            print(f"URL: {urlproceso_limpia}")
            
    print("2. Iniciando Playwright con tu perfil REAL de Chrome...")
    
    # Ruta típica del perfil de Chrome en Windows
    user_data_dir = os.path.join(os.environ['LOCALAPPDATA'], 'Google', 'Chrome', 'User Data')
    
    async with async_playwright() as p:
        try:
            # Usar launch_persistent_context para inyectar tus cookies reales (donde ya pasaste captchas antes)
            context = await p.chromium.launch_persistent_context(
                user_data_dir,
                headless=False, # Debe ser False para que Chrome cargue extensiones y perfil real
                args=[
                    '--ignore-certificate-errors',
                    '--window-position=-32000,-32000' # Ocultar ventana
                ]
            )
            page = await context.new_page()
            
            print("Navegando...")
            await page.goto(urlproceso_limpia, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(7000)
            
            title = await page.title()
            print(f"Título: {title}")
            
            if "ReCaptcha" not in title:
                print("¡ReCaptcha evadido exitosamente usando tu perfil!")
            
            with open("test_secop_html.txt", "w", encoding="utf-8") as f:
                f.write(await page.content())
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            try:
                await context.close()
            except:
                pass

if __name__ == "__main__":
    asyncio.run(test_real_chrome())
