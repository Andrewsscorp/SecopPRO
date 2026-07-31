import sqlite3
conn = sqlite3.connect('secoppro.db')
cursor = conn.cursor()
cursor.execute("SELECT datos_secop FROM contratos WHERE llave_busqueda='CO1.PCCNTR.9438934' LIMIT 1")
row = cursor.fetchone()
if row:
    print(row[0])
else:
    print("No encontrado")
