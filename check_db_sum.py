import sqlite3
import json

db_path = "C:/SecopPRO/Database/database.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get the most recent job_id
cursor.execute("SELECT id_analisis FROM ContratoAnalisis ORDER BY id DESC LIMIT 1")
job_id = cursor.fetchone()[0]

cursor.execute("""
SELECT cs.valor_del_contrato, cs.proveedor_adjudicado
FROM ContratoAnalisis ca
JOIN CacheSecop cs ON ca.llave_busqueda = cs.llave_busqueda
WHERE ca.id_analisis = ?
""", (job_id,))

rows = cursor.fetchall()
print(f"Total contracts: {len(rows)}")

total = 0.0
for row in rows:
    val_str = str(row[0] or "0").replace("$", "").replace("COP", "").strip()
    if "," in val_str and "." in val_str:
        val_str = val_str.replace(".", "").replace(",", ".")
    elif "," in val_str:
        val_str = val_str.replace(",", ".")
    
    try:
        val = float(val_str)
        total += val
    except:
        val = 0.0
    print(f"{val:,.2f} - {row[1]}")

print(f"\nREAL TOTAL: {total:,.2f}")
conn.close()
