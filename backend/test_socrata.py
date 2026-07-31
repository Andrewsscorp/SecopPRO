import asyncio
import aiohttp
import ssl

async def main():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    url = "https://www.datos.gov.co/resource/p6dx-8zbt.json"
    params = {
        "$limit": 1,
        "$q": "CPS 2052-2026-UPTC"
    }
    
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ctx)) as session:
        async with session.get(url, params=params) as resp:
            print("Status:", resp.status)
            if resp.status == 200:
                data = await resp.json()
                print("Len:", len(data))
                if data:
                    print("First:", data[0].get('entidad'), data[0].get('precio_base'))
            else:
                print("Error:", await resp.text())

asyncio.run(main())
