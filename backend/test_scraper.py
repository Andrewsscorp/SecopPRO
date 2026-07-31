import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
import time
import json
import urllib.request
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

def test_scraper_uc():
    print("1. Consultando API para obtener URL...")
    url_socrata = "https://www.datos.gov.co/resource/jbjy-vk9h.json?id_contrato=CO1.PCCNTR.9438934"
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    req = urllib.request.Request(url_socrata, headers={'User-Agent': 'Mozilla/5.0'})
    res = urllib.request.urlopen(req, context=ctx)
    data = json.loads(res.read())
    
    if not data:
        print("No se encontró el contrato.")
        return
        
    urlproceso = data[0].get("urlproceso")
    if isinstance(urlproceso, dict):
        urlproceso = urlproceso.get("url", "N/A")
    print(f"URL Obtenida: {urlproceso}")
    urlproceso_limpia = urlproceso.replace("&isModal=true", "").replace("&asPopupView=true", "")
    
    print("2. Iniciando Undetected ChromeDriver (Evasión 100%)...")
    options = uc.ChromeOptions()
    options.add_argument('--window-position=-32000,-32000') # Ocultar ventana real
    
    try:
        driver = uc.Chrome(options=options) 
        
        print("Navegando a la raíz de SECOP para obtener cookies...")
        driver.get("https://community.secop.gov.co/Public/Index")
        time.sleep(3)
        
        print(f"Navegando a la URL final: {urlproceso_limpia}")
        driver.get(urlproceso_limpia)
        time.sleep(5) # Esperar que carguen los scripts pesados
        
        title = driver.title
        print(f"Título de la página: {title}")
        
        links = driver.find_elements(By.TAG_NAME, "a")
        print(f"Total de enlaces encontrados: {len(links)}")
        
        found_pdfs = 0
        for link in links:
            try:
                href = link.get_attribute("href") or ""
                text = link.text
                if "pdf" in href.lower() or "descargar" in text.lower() or "download" in href.lower() or "downloadfile" in href.lower() or "retrievefile" in href.lower():
                    print(f"Posible link de documento: '{text.strip()}' -> {href}")
                    found_pdfs += 1
            except:
                pass
                
        print(f"Total links probables: {found_pdfs}")
        
        with open("test_secop_html.txt", "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print("HTML guardado en test_secop_html.txt para análisis.")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        try:
            driver.quit()
        except:
            pass

if __name__ == "__main__":
    test_scraper_uc()
