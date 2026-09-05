from __future__ import annotations

import json
import sqlite3
from pathlib import Path


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    git_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fact (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    value_num REAL,
    value_unit TEXT,
    value_text TEXT,
    source_doc TEXT NOT NULL,
    source_anchor TEXT NOT NULL,
    mark TEXT NOT NULL CHECK(mark IN ('И', 'В', 'П')),
    disposition TEXT NOT NULL CHECK(disposition IN ('noted', 'adopted', 'assumed')),
    author TEXT NOT NULL,
    at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS entity (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('stakeholder', 'scenario', 'mode', 'requirement')),
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    fields TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS document (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project(id),
    template_code TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Draft', 'Baseline')),
    generated_sdoc_hash TEXT,
    generated_rendered_hash TEXT
);

CREATE TABLE IF NOT EXISTS section (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES document(id),
    no TEXT NOT NULL,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    UNIQUE(document_id, no)
);

CREATE TABLE IF NOT EXISTS element (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES section(id),
    kind TEXT NOT NULL CHECK(kind IN ('fact_ref', 'entity_ref', 'statement', 'query', 'figure', 'table')),
    ref_id TEXT,
    ref_version INTEGER,
    text TEXT,
    supports TEXT NOT NULL DEFAULT '[]',
    query_json TEXT,
    author TEXT NOT NULL,
    at TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS baseline (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES document(id),
    name TEXT NOT NULL,
    git_tag TEXT NOT NULL,
    items TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    by_user TEXT NOT NULL,
    at TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    UNIQUE(document_id, git_tag)
);

CREATE TABLE IF NOT EXISTS rendering (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES document(id),
    baseline_id TEXT REFERENCES baseline(id),
    sections TEXT NOT NULL,
    engine TEXT NOT NULL CHECK(engine IN ('llm', 'stub')),
    model TEXT,
    prompt_fingerprint TEXT NOT NULL,
    patches TEXT NOT NULL DEFAULT '[]',
    reviewer TEXT,
    accepted_at TEXT,
    created_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS release (
    id TEXT PRIMARY KEY,
    rendering_id TEXT NOT NULL REFERENCES rendering(id),
    files TEXT NOT NULL,
    authors TEXT NOT NULL,
    released_by TEXT NOT NULL,
    at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_section_document ON section(document_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_element_section ON element(section_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_baseline_document ON baseline(document_id, at);
CREATE INDEX IF NOT EXISTS idx_rendering_document ON rendering(document_id, created_at);
"""


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @staticmethod
    def _migrate_baseline_unique(connection: sqlite3.Connection) -> None:
        unique_indexes = []
        for index in connection.execute("PRAGMA index_list(baseline)").fetchall():
            if index[2]:
                unique_indexes.append(
                    [row[2] for row in connection.execute(f'PRAGMA index_info("{index[1]}")').fetchall()]
                )
        if ["git_tag"] not in unique_indexes:
            return
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.executescript(
            """
            BEGIN IMMEDIATE;
            CREATE TABLE baseline_new (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES document(id),
                name TEXT NOT NULL,
                git_tag TEXT NOT NULL,
                items TEXT NOT NULL,
                snapshot_json TEXT NOT NULL,
                by_user TEXT NOT NULL,
                at TEXT NOT NULL,
                commit_hash TEXT NOT NULL,
                UNIQUE(document_id, git_tag)
            );
            INSERT INTO baseline_new
                (id, document_id, name, git_tag, items, snapshot_json, by_user, at, commit_hash)
            SELECT id, document_id, name, git_tag, items, snapshot_json, by_user, at, commit_hash
            FROM baseline;
            DROP TABLE baseline;
            ALTER TABLE baseline_new RENAME TO baseline;
            CREATE INDEX idx_baseline_document ON baseline(document_id, at);
            COMMIT;
            """
        )
        connection.execute("PRAGMA foreign_keys = ON")
        violations = connection.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise sqlite3.IntegrityError(f"Baseline migration left foreign-key violations: {violations}")

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            self._migrate_baseline_unique(connection)
            document_columns = {row[1] for row in connection.execute("PRAGMA table_info(document)")}
            if "generated_rendered_hash" not in document_columns:
                connection.execute("ALTER TABLE document ADD COLUMN generated_rendered_hash TEXT")
            connection.execute("PRAGMA optimize")


def seed_demo(database: Database, docs_root: Path) -> None:
    """Install the deterministic ConOps scenario once."""
    at = "2026-09-05T09:00:00+03:00"
    project_id = "project-pump"
    document_id = "doc-conops"
    with database.connect() as connection:
        exists = connection.execute("SELECT 1 FROM project WHERE id = ?", (project_id,)).fetchone()
        if exists:
            return

        repo_path = str((Path(docs_root) / project_id).resolve())
        connection.execute(
            "INSERT INTO project(id, name, git_path) VALUES (?, ?, ?)",
            (project_id, "Насосная станция · концепция", repo_path),
        )
        connection.execute(
            """INSERT INTO document
               (id, project_id, template_code, code, title, owner, status)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (document_id, project_id, "conops-pump", "ConOps", "Концепция эксплуатации насосной станции", "si", "Draft"),
        )

        sections = [
            ("sec-1", document_id, "§1", "Назначение и контекст", 1),
            ("sec-2", document_id, "§2", "Режимы и состояния", 2),
            ("sec-3", document_id, "§3", "Операционные сценарии", 3),
            ("sec-4", document_id, "§4", "Среда и ограничения", 4),
        ]
        connection.executemany(
            "INSERT INTO section(id, document_id, no, title, sort_order) VALUES (?, ?, ?, ?, ?)",
            sections,
        )

        facts = [
            ("fact-001", "Инфраструктура района", "содержит", 3, "станции", None, "Схема водоснабжения", "§2.1", "И", "noted", "si", at, 1),
            ("fact-002", "Насосный агрегат", "обеспечивает поток", 120, "м³/ч", None, "Паспорт насоса NP-120", "табл. 4", "В", "adopted", "eng", at, 1),
            ("fact-003", "Напорный коллектор", "рабочее давление", 6, "бар", None, "Паспорт насоса NP-120", "п. 3.2", "В", "adopted", "eng", at, 1),
            ("fact-004", "Аварийная служба", "время реакции", 120, "с", "не более", "План реагирования", "п. 5", "П", "assumed", "si", at, 1),
            ("fact-005", "Диспетчерская", "состав смены", 2, "оператора", "одна смена", "Штатное расписание", "строка 12", "И", "noted", "si", at, 1),
            ("fact-006", "Оборудование", "минимальная температура", -35, "°C", None, "Климатический отчёт", "§1.4", "И", "adopted", "eng", at, 1),
            ("fact-007", "Силовая сеть", "напряжение", 400, "В", None, "Однолинейная схема", "лист 2", "В", "adopted", "eng", at, 1),
            ("fact-008", "Насосный агрегат", "межсервисный интервал", 6, "месяцев", None, "Регламент ТО", "ТО-01", "П", "assumed", "eng", at, 1),
        ]
        connection.executemany(
            """INSERT INTO fact
               (id, subject, predicate, value_num, value_unit, value_text, source_doc,
                source_anchor, mark, disposition, author, at, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            facts,
        )

        entities = [
            ("ent-st-operator", "stakeholder", "ST-01", "Диспетчер", {"interest": "безопасный дистанционный пуск"}, 1),
            ("ent-st-service", "stakeholder", "ST-02", "Служба эксплуатации", {"interest": "обслуживание без остановки района"}, 1),
            ("ent-st-owner", "stakeholder", "ST-03", "Владелец инфраструктуры", {"interest": "предсказуемая стоимость владения"}, 1),
            ("ent-mode-normal", "mode", "MODE-01", "Штатный режим", {"description": "автоматическое поддержание давления"}, 1),
            ("ent-mode-alarm", "mode", "MODE-02", "Авария по давлению", {"description": "защитное отключение и оповещение"}, 1),
            ("ent-mode-service", "mode", "MODE-03", "Обслуживание", {"description": "ручное управление с блокировками"}, 1),
            ("ent-scn-start", "scenario", "SCN-01", "Штатный пуск", {"actor": "диспетчер", "outcome": "станция вышла на режим"}, 1),
            ("ent-scn-alarm", "scenario", "SCN-02", "Авария по давлению", {"actor": "автоматика", "outcome": "агрегат остановлен, диспетчер уведомлён"}, 1),
            ("ent-req-stop", "requirement", "RQ-001", "Аварийное отключение", {"statement": "Остановить насосную группу при критическом падении давления"}, 1),
            ("ent-req-signal", "requirement", "RQ-002", "Сигнал диспетчеру", {"statement": "Передать подтверждённый сигнал аварии"}, 1),
            ("ent-req-log", "requirement", "RQ-003", "Журнал событий", {"statement": "Сохранять аварийные события и действия оператора"}, 1),
        ]
        connection.executemany(
            "INSERT INTO entity(id, kind, code, title, fields, version) VALUES (?, ?, ?, ?, ?, ?)",
            [(id_, kind, code, title, json.dumps(fields, ensure_ascii=False), version) for id_, kind, code, title, fields, version in entities],
        )

        elements = [
            ("EL-001", "sec-1", "statement", None, None, "Система предназначена для надёжного водоснабжения района и управляется из диспетчерской.", [], None, "si", at, 1, 1),
            ("EL-002", "sec-1", "entity_ref", "ent-st-operator", 1, None, [], None, "si", at, 2, 1),
            ("EL-003", "sec-1", "entity_ref", "ent-st-service", 1, None, [], None, "eng", at, 3, 1),
            ("EL-004", "sec-2", "entity_ref", "ent-mode-normal", 1, None, [], None, "eng", at, 1, 1),
            ("EL-005", "sec-2", "entity_ref", "ent-mode-alarm", 1, None, [], None, "eng", at, 2, 1),
            ("EL-006", "sec-2", "entity_ref", "ent-mode-service", 1, None, [], None, "eng", at, 3, 1),
            ("EL-007", "sec-3", "entity_ref", "ent-scn-start", 1, None, [], None, "si", at, 1, 1),
            ("EL-008", "sec-3", "entity_ref", "ent-scn-alarm", 1, None, [], None, "eng", at, 2, 1),
            ("EL-009", "sec-3", "statement", None, None, "Сценарии описывают наблюдаемое взаимодействие диспетчера, автоматики и эксплуатационной службы.", [], None, "si", at, 3, 1),
            ("EL-010", "sec-4", "fact_ref", "fact-002", 1, None, [], None, "eng", at, 1, 1),
            ("EL-011", "sec-4", "fact_ref", "fact-003", 1, None, [], None, "eng", at, 2, 1),
            ("EL-012", "sec-4", "query", None, None, None, [], {"kind": "requirement", "filter": "status != deleted", "columns": ["code", "title"]}, "si", at, 3, 1),
        ]
        connection.executemany(
            """INSERT INTO element
               (id, section_id, kind, ref_id, ref_version, text, supports, query_json,
                author, at, sort_order, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (id_, section, kind, ref_id, ref_version, text, json.dumps(supports), json.dumps(query, ensure_ascii=False) if query else None, author, at_, order, version)
                for id_, section, kind, ref_id, ref_version, text, supports, query, author, at_, order, version in elements
            ],
        )
