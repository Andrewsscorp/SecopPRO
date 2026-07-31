import asyncio
import sys
import threading
import concurrent.futures
from playwright.async_api import async_playwright

def run_in_thread():
    print("En el hilo. Platform:", sys.platform)
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    print("Tipo de loop:", type(loop).__name__)
    
    async def _test():
        print("Iniciando playwright...")
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            print("Browser lanzado!")
            await browser.close()
            
    try:
        loop.run_until_complete(_test())
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        loop.close()

if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(run_in_thread).result()
