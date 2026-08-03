import sqlite3

db_path = "C:/SecopPRO/Database/database.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get the most recent job_id
cursor.execute("SELECT id FROM analisis_realizados ORDER BY hora_inicio DESC LIMIT 1")
job_row = cursor.fetchone()

if job_row:
    job_id = job_row[0]
    cursor.execute("DELETE FROM pdf_ai_cache WHERE job_id = ?", (job_id,))
    conn.commit()
    print(f"Borrando caché de IA para el análisis: {job_id}")
else:
    print("No se encontró ningún análisis.")

conn.close()
