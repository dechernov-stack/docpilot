from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Any, Literal

from fastapi import Body, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field

from .database import Database, seed_demo
from .service import DocPilotError, DocPilotService, find_tool


ROOT = Path(__file__).resolve().parents[2]
logging.basicConfig(level=os.getenv("DOCPILOT_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")


class ProjectCreate(BaseModel):
    name: str = Field("Новый проект", min_length=1, max_length=160, pattern=r"^[^\r\n]+$")


class DocumentCreate(BaseModel):
    project_id: str
    template_code: str = "conops-pump"
    code: str = Field("ConOps", pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
    title: str = Field("Концепция эксплуатации", min_length=1, max_length=200, pattern=r"^[^\r\n]+$")
    owner: Literal["si", "eng", "rev"] = "si"


class FactCreate(BaseModel):
    id: str | None = Field(None, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
    subject: str
    predicate: str
    value_num: float | None = None
    value_unit: str | None = None
    value_text: str | None = None
    source_doc: str
    source_anchor: str
    mark: Literal["И", "В", "П"] = "И"
    disposition: Literal["noted", "adopted", "assumed"] = "noted"
    author: Literal["si", "eng", "rev"] = "eng"


class FactUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str | None = None
    predicate: str | None = None
    value_num: float | None = None
    value_unit: str | None = None
    value_text: str | None = None
    source_doc: str | None = None
    source_anchor: str | None = None
    mark: Literal["И", "В", "П"] | None = None
    disposition: Literal["noted", "adopted", "assumed"] | None = None
    author: Literal["si", "eng", "rev"] | None = None


class EntityCreate(BaseModel):
    id: str | None = Field(None, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
    kind: Literal["stakeholder", "scenario", "mode", "requirement"]
    code: str = Field(..., min_length=1, max_length=80, pattern=r"^[^\r\n]+$")
    title: str = Field(..., min_length=1, max_length=200, pattern=r"^[^\r\n]+$")
    fields: dict[str, Any] = Field(default_factory=dict)


class EntityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["stakeholder", "scenario", "mode", "requirement"] | None = None
    code: str | None = Field(None, min_length=1, max_length=80, pattern=r"^[^\r\n]+$")
    title: str | None = Field(None, min_length=1, max_length=200, pattern=r"^[^\r\n]+$")
    fields: dict[str, Any] | None = None


class ElementCreate(BaseModel):
    section_id: str
    kind: Literal["fact_ref", "entity_ref", "statement", "query", "figure", "table"]
    ref_id: str | None = None
    text: str | None = None
    supports: list[str] = Field(default_factory=list)
    query: dict[str, Any] | None = None
    author: Literal["si", "eng", "rev"] = "eng"


class ElementUpdate(BaseModel):
    text: str | None = None
    supports: list[str] | None = None
    query: dict[str, Any] | None = None
    author: Literal["si", "eng", "rev"] | None = None


class BaselineCreate(BaseModel):
    name: str = "MCR"
    by: Literal["si", "eng", "rev"] = "si"


class RenderCreate(BaseModel):
    baseline: str | None = None
    by: Literal["si", "eng", "rev"] = "si"
    simulate_sections: dict[str, str] | None = None


class ReviewUpdate(BaseModel):
    text: str
    reviewer: str = "rev"


class AcceptRequest(BaseModel):
    reviewer: str = "rev"


class ReleaseCreate(BaseModel):
    rendering_id: str
    released_by: str = "si"
    include_docx: bool = False


def create_app(db_path: Path | None = None, docs_root: Path | None = None) -> FastAPI:
    resolved_db = db_path or Path(os.getenv("DOCPILOT_DB", ROOT / "backend" / "data" / "docpilot.db"))
    resolved_docs = docs_root or Path(os.getenv("DOCPILOT_DOCS_ROOT", ROOT / "backend" / "data" / "repos"))
    database = Database(resolved_db)
    database.initialize()
    seed_demo(database, resolved_docs)
    service = DocPilotService(database, ROOT)
    service.export_sdoc("doc-conops")

    app = FastAPI(
        title="DocPilot API",
        version="0.1.0",
        description="Прототип структурного ведения ConOps: SQLite → StrictDoc → Git → рендеринг → выпуск.",
    )
    app.state.service = service
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:8080", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DocPilotError)
    async def docpilot_error(_: Request, error: DocPilotError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status,
            content={"code": error.code, "message": error.message, "reasons": error.reasons},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={
                "code": "REQUEST_INVALID",
                "message": "Запрос не прошёл проверку",
                "reasons": [f"{'.'.join(map(str, item['loc'][1:]))}: {item['msg']}" for item in error.errors()],
            },
        )

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "DocPilot",
            "render_engine": "stub",
            "strictdoc": find_tool("strictdoc") is not None,
            "typst": find_tool("typst") is not None,
        }

    @app.get("/api/demo")
    def demo(stage: str = Query("SRR")) -> dict[str, Any]:
        return {
            "document": service.get_document("doc-conops", stage),
            "facts": service.list_facts(),
            "entities": service.list_entities(),
            "baselines": service.list_baselines("doc-conops"),
            "renderings": service.list_renderings("doc-conops"),
            "releases": service.list_releases("doc-conops"),
            "runtime": health(),
        }

    @app.post("/api/projects", status_code=201)
    def create_project(payload: ProjectCreate) -> dict[str, Any]:
        return service.create_project(payload.name)

    @app.post("/api/documents", status_code=201)
    def create_document(payload: DocumentCreate) -> dict[str, Any]:
        data = payload.model_dump(exclude={"project_id"})
        return service.create_document(payload.project_id, data)

    @app.get("/api/documents/{document_id}")
    def get_document(document_id: str, stage: str = Query("SRR")) -> dict[str, Any]:
        return service.get_document(document_id, stage)

    @app.get("/api/facts")
    def get_facts() -> list[dict[str, Any]]:
        return service.list_facts()

    @app.get("/api/facts/{fact_id}")
    def get_fact(fact_id: str) -> dict[str, Any]:
        fact = next((item for item in service.list_facts() if item["id"] == fact_id), None)
        if not fact:
            raise DocPilotError(404, "FACT_NOT_FOUND", "Факт не найден", [fact_id])
        return fact

    @app.post("/api/facts", status_code=201)
    def create_fact(payload: FactCreate) -> dict[str, Any]:
        return service.create_fact(payload.model_dump())

    @app.put("/api/facts/{fact_id}")
    def update_fact(fact_id: str, payload: FactUpdate) -> dict[str, Any]:
        return service.update_fact(fact_id, payload.model_dump(exclude_none=True))

    @app.delete("/api/facts/{fact_id}")
    def delete_fact(fact_id: str) -> dict[str, bool]:
        service.delete_fact(fact_id)
        return {"deleted": True}

    @app.get("/api/entities")
    def get_entities(kind: str | None = Query(None)) -> list[dict[str, Any]]:
        return service.list_entities(kind)

    @app.get("/api/entities/{entity_id}")
    def get_entity(entity_id: str) -> dict[str, Any]:
        entity = next((item for item in service.list_entities() if item["id"] == entity_id), None)
        if not entity:
            raise DocPilotError(404, "ENTITY_NOT_FOUND", "Сущность не найдена", [entity_id])
        return entity

    @app.post("/api/entities", status_code=201)
    def create_entity(payload: EntityCreate) -> dict[str, Any]:
        return service.create_entity(payload.model_dump())

    @app.put("/api/entities/{entity_id}")
    def update_entity(entity_id: str, payload: EntityUpdate) -> dict[str, Any]:
        return service.update_entity(entity_id, payload.model_dump(exclude_none=True))

    @app.delete("/api/entities/{entity_id}")
    def delete_entity(entity_id: str) -> dict[str, bool]:
        service.delete_entity(entity_id)
        return {"deleted": True}

    @app.post("/api/documents/{document_id}/elements", status_code=201)
    def add_element(document_id: str, payload: ElementCreate) -> dict[str, Any]:
        return service.add_element(document_id, payload.model_dump())

    @app.put("/api/documents/{document_id}/elements/{element_id}")
    def update_element(document_id: str, element_id: str, payload: ElementUpdate) -> dict[str, Any]:
        return service.update_element(document_id, element_id, payload.model_dump(exclude_none=True))

    @app.delete("/api/documents/{document_id}/elements/{element_id}")
    def delete_element(document_id: str, element_id: str) -> dict[str, bool]:
        service.delete_element(document_id, element_id)
        return {"deleted": True}

    @app.get("/api/documents/{document_id}/sdoc", response_class=PlainTextResponse)
    def export_sdoc(document_id: str) -> str:
        return service.export_sdoc(document_id)["content"]

    @app.get("/api/documents/{document_id}/sdoc/check")
    def check_sdoc(document_id: str) -> dict[str, Any]:
        return service.check_sdoc(document_id)

    @app.post("/api/documents/{document_id}/baseline", status_code=201)
    def create_baseline(document_id: str, payload: BaselineCreate) -> dict[str, Any]:
        return service.create_baseline(document_id, payload.name, payload.by)

    @app.get("/api/documents/{document_id}/baselines")
    def baselines(document_id: str) -> list[dict[str, Any]]:
        return service.list_baselines(document_id)

    @app.get("/api/documents/{document_id}/diff")
    def diff(document_id: str, from_: str = Query(alias="from"), to: str = Query(...)) -> dict[str, Any]:
        result = service.diff_baselines(from_, to)
        if service._baseline(from_)["document_id"] != document_id:
            raise DocPilotError(400, "DIFF_SCOPE_INVALID", "Базирование относится к другому документу")
        return result

    @app.post("/api/documents/{document_id}/render", status_code=201)
    def render(
        document_id: str,
        payload: RenderCreate = Body(default_factory=RenderCreate),
        baseline: str | None = Query(None),
    ) -> dict[str, Any]:
        selected_baseline = baseline if baseline is not None else payload.baseline
        return service.create_rendering(document_id, selected_baseline, payload.by, payload.simulate_sections)

    @app.get("/api/documents/{document_id}/renderings")
    def renderings(document_id: str) -> list[dict[str, Any]]:
        return service.list_renderings(document_id)

    @app.put("/api/renderings/{rendering_id}/section/{no}")
    def review_section(rendering_id: str, no: str, payload: ReviewUpdate) -> dict[str, Any]:
        return service.update_rendering_section(rendering_id, no, payload.text, payload.reviewer)

    @app.post("/api/renderings/{rendering_id}/accept")
    def accept_rendering(rendering_id: str, payload: AcceptRequest) -> dict[str, Any]:
        return service.accept_rendering(rendering_id, payload.reviewer)

    @app.post("/api/release", status_code=201)
    def release(payload: ReleaseCreate) -> dict[str, Any]:
        return service.create_release(payload.rendering_id, payload.released_by, payload.include_docx)

    @app.get("/api/documents/{document_id}/releases")
    def releases(document_id: str) -> list[dict[str, Any]]:
        return service.list_releases(document_id)

    @app.get("/api/releases/{release_id}/files/{file_key}")
    def download_release(release_id: str, file_key: str) -> FileResponse:
        return FileResponse(service.release_file(release_id, file_key), filename=service.release_file(release_id, file_key).name)

    return app


app = create_app()
