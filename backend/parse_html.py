from bs4 import BeautifulSoup
import re

with open('test_secop_success.txt', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')

links = soup.find_all('a', id=re.compile(r'lnkDownloadLink'))
for i, link in enumerate(links[:5]):
    print(f"[{i}] {link}")
    
links_doc = soup.find_all('a', href=re.compile(r'DownloadDocument'))
for i, link in enumerate(links_doc[:5]):
    print(f"DOC [{i}] {link}")
