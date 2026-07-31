from pydantic import BaseModel
from typing import List, Optional

class ColumnMapping(BaseModel):
    excelCol: str
    secopField: Optional[str]
    isValid: bool
    isKey: bool

class AnalysisConfig(BaseModel):
    nombreAnalisis: str
    fechaCorte: str

class PayloadConfig(BaseModel):
    mappedColumns: List[ColumnMapping]
    configToggles: dict
    analysisConfig: AnalysisConfig
    ocrSearchTerm: str

class StartAnalysisResponse(BaseModel):
    job_id: str
    message: str
