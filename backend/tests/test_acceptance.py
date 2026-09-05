from __future__ import annotations

import re
import subprocess
from pathlib import Path

import backend.app.service as service_module
from fastapi.testclient import TestClient


DOCUMENT_ID = "doc-conops"


def baseline(client: TestClient, name: str = "MCR") -> dict:
    response = client.post(f"/api/documents/{DOCUMENT_ID}/baseline", json={"name": name, "by": "si"})
    assert response.status_code == 201, response.text
    return response.json()


def rendering(client: TestClient, baseline_id: str | None = None) -> dict:
    response = client.post(
        f"/api/documents/{DOCUMENT_ID}/render",
        json={"baseline": baseline_id, "by": "si"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_ac01_completeness_by_stage(client: TestClient) -> None:
    srr = client.get(f"/api/documents/{DOCUMENT_ID}?stage=SRR").json()
    section_3 = next(section for section in srr["sections"] if section["no"] == "§3")
    scenario = next(check for check in section_3["completeness"]["checks"] if check.get("entity_kind") == "scenario")
    assert scenario["count"] == 2
    assert scenario["min"] == 3
    assert scenario["missing"] == 1
    assert "добавить" in scenario["message"].lower()
    assert srr["completeness"] == {"complete_sections": 3, "total_sections": 4, "complete": False}

    mcr = client.get(f"/api/documents/{DOCUMENT_ID}?stage=MCR").json()
    assert mcr["completeness"] == {"complete_sections": 4, "total_sections": 4, "complete": True}


def test_ac02_statement_number_requires_support(client: TestClient) -> None:
    response = client.post(
        f"/api/documents/{DOCUMENT_ID}/elements",
        json={"section_id": "sec-4", "kind": "statement", "text": "Допустимое давление — 6 бар.", "supports": [], "author": "eng"},
    )
    assert response.status_code == 400
    assert set(response.json()) == {"code", "message", "reasons"}
    assert response.json()["code"] == "ELEMENT_INVALID"
    assert any("Число без основания" in reason for reason in response.json()["reasons"])

    accepted = client.post(
        f"/api/documents/{DOCUMENT_ID}/elements",
        json={"section_id": "sec-4", "kind": "statement", "text": "Допустимое давление — 6 бар.", "supports": ["fact-003"], "author": "eng"},
    )
    assert accepted.status_code == 201


def test_ac03_generated_sdoc_is_parsed_by_strictdoc(client: TestClient, service) -> None:
    response = client.get(f"/api/documents/{DOCUMENT_ID}/sdoc/check")
    assert response.status_code == 200, response.text
    assert response.json()["verified"] is True
    assert response.json()["mode"] in {"strictdoc-check", "strictdoc-export-parse"}

    export = service.export_sdoc(DOCUMENT_ID)
    content = export["content"]
    mids = re.findall(r"^MID: (.+)$", content, re.MULTILINE)
    assert len(mids) == len(set(mids))
    for tag in ("FACT_REF", "ENTITY_REF", "STATEMENT", "QUERY"):
        assert f"[{tag}]" in content


def test_ac04_first_baseline_creates_commit_and_tag(client: TestClient, service) -> None:
    item = baseline(client)
    assert item["git_tag"] == "BL-MCR-1"
    assert len(item["commit_hash"]) == 40
    repo = Path(service._snapshot(DOCUMENT_ID)["git_path"])
    tag_commit = subprocess.run(["git", "rev-list", "-n", "1", item["git_tag"]], cwd=repo, text=True, capture_output=True, check=True).stdout.strip()
    assert tag_commit == item["commit_hash"]
    author = subprocess.run(["git", "show", "-s", "--format=%an", item["commit_hash"]], cwd=repo, text=True, capture_output=True, check=True).stdout.strip()
    assert author == "si"


def test_ac05_mid_diff_reports_one_changed_statement(client: TestClient) -> None:
    first = baseline(client)
    update = client.put(
        f"/api/documents/{DOCUMENT_ID}/elements/EL-009",
        json={"text": "Сценарии фиксируют наблюдаемое взаимодействие диспетчера, автоматики и эксплуатационной службы.", "author": "si"},
    )
    assert update.status_code == 200, update.text
    second = baseline(client)
    assert second["git_tag"] == "BL-MCR-2"
    diff = client.get(f"/api/documents/{DOCUMENT_ID}/diff", params={"from": first["id"], "to": second["id"]})
    assert diff.status_code == 200, diff.text
    body = diff.json()
    assert body["summary"] == {"added": 0, "changed": 1, "removed": 0}
    assert body["changed"][0]["mid"] == "EL-009"
    assert [field["field"] for field in body["changed"][0]["fields"]] == ["STATEMENT"]


def test_ac06_stub_render_is_traceable_and_committed(client: TestClient, service) -> None:
    item = baseline(client)
    result = rendering(client, item["id"])
    assert result["engine"] == "stub"
    assert len(result["sections"]) == 4
    for section in result["sections"]:
        for line in section["text"].splitlines():
            assert re.search(r"\[EL-\d{3}\]$", line)
    repo = Path(service._snapshot(DOCUMENT_ID)["git_path"])
    files = subprocess.run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=repo, text=True, capture_output=True, check=True).stdout
    assert "docs/rendered/ConOps.sdoc" in files
    assert "[TEXT]" in (repo / "docs" / "rendered" / "ConOps.sdoc").read_text(encoding="utf-8")


def test_ac07_render_guard_rejects_unbacked_number_atomically(client: TestClient) -> None:
    item = baseline(client)
    response = client.post(
        f"/api/documents/{DOCUMENT_ID}/render",
        json={"baseline": item["id"], "by": "si", "simulate_sections": {"§4": "Рабочее давление 7 бар. [EL-011]"}},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "RENDER_TRACEABILITY_FAILED"
    assert any("7" in reason for reason in response.json()["reasons"])
    assert client.get(f"/api/documents/{DOCUMENT_ID}/renderings").json() == []


def test_ac08_review_allows_wording_and_rejects_numbers(client: TestClient) -> None:
    item = baseline(client)
    result = rendering(client, item["id"])
    section_1 = result["sections"][0]
    reworded = section_1["text"].replace("Система предназначена", "Предназначена система")
    accepted = client.put(
        f"/api/renderings/{result['id']}/section/%C2%A71",
        json={"text": reworded, "reviewer": "rev"},
    )
    assert accepted.status_code == 200, accepted.text
    assert len(accepted.json()["patches"]) == 1
    assert accepted.json()["patches"][0]["author"] == "rev"

    current = accepted.json()
    section_4 = next(section for section in current["sections"] if section["no"] == "§4")
    changed_number = section_4["text"].replace("120", "90", 1)
    rejected = client.put(
        f"/api/renderings/{result['id']}/section/%C2%A74",
        json={"text": changed_number, "reviewer": "rev"},
    )
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "REVIEW_SEMANTICS_CHANGED"
    saved = client.get(f"/api/documents/{DOCUMENT_ID}/renderings").json()[0]
    assert next(section for section in saved["sections"] if section["no"] == "§4")["text"] == section_4["text"]
    assert len(saved["patches"]) == 1


def test_ac09_changed_fact_marks_exact_support(client: TestClient) -> None:
    baseline(client)
    response = client.put("/api/facts/fact-003", json={"value_num": 7, "author": "eng"})
    assert response.status_code == 200, response.text
    document = client.get(f"/api/documents/{DOCUMENT_ID}?stage=SRR").json()
    drift = document["support_drift"]
    assert drift["changed"] is True
    assert len(drift["items"]) == 1
    assert drift["items"][0]["element_id"] == "EL-011"
    assert drift["items"][0]["section"] == "§4"


def test_ac10_release_has_two_pdfs_and_all_authors(client: TestClient) -> None:
    item = baseline(client)
    result = rendering(client, item["id"])
    accepted = client.post(f"/api/renderings/{result['id']}/accept", json={"reviewer": "rev"})
    assert accepted.status_code == 200
    response = client.post("/api/release", json={"rendering_id": result["id"], "released_by": "si", "include_docx": False})
    assert response.status_code == 201, response.text
    release = response.json()
    assert release["authors"] == ["si", "eng", "rev"]
    for key in ("pdf_html2pdf", "pdf_typst"):
        path = Path(release["files"][key]["path"])
        assert path.exists()
        assert path.read_bytes().startswith(b"%PDF")


def test_ac11_manual_sdoc_change_is_refused(client: TestClient, service) -> None:
    export = service.export_sdoc(DOCUMENT_ID)
    path = Path(export["path"])
    path.write_text(path.read_text(encoding="utf-8") + "MANUAL CHANGE\n", encoding="utf-8")
    response = client.get(f"/api/documents/{DOCUMENT_ID}/sdoc")
    assert response.status_code == 409
    assert response.json()["code"] == "SDOC_DIVERGED"
    assert path.read_text(encoding="utf-8").endswith("MANUAL CHANGE\n")


def test_guard_compares_units_and_operators(client: TestClient) -> None:
    item = baseline(client)
    wrong_unit = client.post(
        f"/api/documents/{DOCUMENT_ID}/render",
        json={"baseline": item["id"], "simulate_sections": {"§4": "Рабочий поток 120 бар. [EL-010]"}},
    )
    assert wrong_unit.status_code == 422
    assert any("120 бар" in reason for reason in wrong_unit.json()["reasons"])

    result = rendering(client, item["id"])
    section = next(section for section in result["sections"] if section["no"] == "§4")
    review = client.put(
        f"/api/renderings/{result['id']}/section/%C2%A74",
        json={"text": section["text"].replace("120 м³/ч", "120 бар"), "reviewer": "rev"},
    )
    assert review.status_code == 422
    assert review.json()["code"] == "REVIEW_SEMANTICS_CHANGED"


def test_statement_support_is_baselined_and_drift_resets_on_new_baseline(client: TestClient) -> None:
    created = client.post(
        f"/api/documents/{DOCUMENT_ID}/elements",
        json={"section_id": "sec-4", "kind": "statement", "text": "Время реакции 120 с.", "supports": ["fact-004"], "author": "eng"},
    )
    assert created.status_code == 201
    first = baseline(client)
    assert {item["id"] for item in first["items"] if item["type"] == "fact"} >= {"fact-004"}

    assert client.put("/api/facts/fact-004", json={"value_num": 90}).status_code == 200
    drift = client.get(f"/api/documents/{DOCUMENT_ID}").json()["support_drift"]
    assert any(item["element_id"] == created.json()["id"] for item in drift["items"])

    baseline(client)
    assert client.get(f"/api/documents/{DOCUMENT_ID}").json()["support_drift"] == {"changed": False, "items": []}


def test_fact_change_appears_in_mid_diff_and_release_uses_selected_render(client: TestClient) -> None:
    first = baseline(client)
    first_render = rendering(client, first["id"])
    assert client.post(f"/api/renderings/{first_render['id']}/accept", json={"reviewer": "rev"}).status_code == 200

    assert client.put("/api/facts/fact-003", json={"value_num": 7, "author": "eng"}).status_code == 200
    second = baseline(client)
    diff = client.get(
        f"/api/documents/{DOCUMENT_ID}/diff", params={"from": first["id"], "to": second["id"]}
    ).json()
    changed = next(item for item in diff["changed"] if item["mid"] == "EL-011")
    assert any(field["field"].endswith("VALUE_NUM") for field in changed["fields"])

    rendering(client, second["id"])
    release = client.post(
        "/api/release", json={"rendering_id": first_render["id"], "released_by": "si"}
    )
    assert release.status_code == 201, release.text
    release_dir = Path(release.json()["files"]["pdf_typst"]["path"]).parent
    release_sdoc = (release_dir / "ConOps-rendered.sdoc").read_text(encoding="utf-8")
    assert "6 бар" in release_sdoc
    assert "7 бар" not in release_sdoc


def test_render_query_param_diff_across_baselines_and_review_qualifiers(client: TestClient) -> None:
    first = baseline(client)
    first_render_response = client.post(
        f"/api/documents/{DOCUMENT_ID}/render",
        params={"baseline": first["id"]},
        json={"by": "si"},
    )
    assert first_render_response.status_code == 201, first_render_response.text
    first_render = first_render_response.json()
    assert first_render["baseline_id"] == first["id"]

    assert client.put("/api/facts/fact-003", json={"value_num": 7, "author": "eng"}).status_code == 200
    second = baseline(client)
    second_render = rendering(client, second["id"])
    assert second_render["text_diff"]["from_rendering"] == first_render["id"]
    assert second_render["text_diff"]["summary"] == {"changed_sections": 1}
    assert second_render["text_diff"]["sections"][0]["no"] == "§4"
    patch = second_render["text_diff"]["sections"][0]["patch"]
    assert "6 бар" in patch and "7 бар" in patch
    listed = client.get(f"/api/documents/{DOCUMENT_ID}/renderings").json()[0]
    assert listed["text_diff"] == second_render["text_diff"]

    section = next(section for section in second_render["sections"] if section["no"] == "§4")
    changed_qualifier = section["text"].replace("7 бар", "не менее 7 бар", 1)
    rejected = client.put(
        f"/api/renderings/{second_render['id']}/section/%C2%A74",
        json={"text": changed_qualifier, "reviewer": "rev"},
    )
    assert rejected.status_code == 422
    assert any("квалификаторы" in reason for reason in rejected.json()["reasons"])


def test_manual_rendered_sdoc_change_is_refused(client: TestClient, service) -> None:
    item = baseline(client)
    rendering(client, item["id"])
    document = service._snapshot(DOCUMENT_ID)
    path = Path(document["git_path"]) / "docs" / "rendered" / "ConOps.sdoc"
    path.write_text(path.read_text(encoding="utf-8") + "MANUAL CHANGE\n", encoding="utf-8")

    response = client.post(
        f"/api/documents/{DOCUMENT_ID}/render",
        json={"baseline": item["id"], "by": "si"},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "RENDERED_SDOC_DIVERGED"
    assert path.read_text(encoding="utf-8").endswith("MANUAL CHANGE\n")


def test_native_print_missing_tool_fails_without_release_or_artifacts(
    client: TestClient, service, monkeypatch,
) -> None:
    item = baseline(client)
    item_rendering = rendering(client, item["id"])
    assert client.post(
        f"/api/renderings/{item_rendering['id']}/accept", json={"reviewer": "rev"}
    ).status_code == 200
    repo = Path(service._snapshot(DOCUMENT_ID)["git_path"])
    releases_root = repo / "releases"
    before = set(releases_root.iterdir()) if releases_root.exists() else set()
    monkeypatch.setenv("DOCPILOT_NATIVE_PRINT", "1")
    monkeypatch.setattr(service_module, "find_tool", lambda _: None)

    response = client.post(
        "/api/release", json={"rendering_id": item_rendering["id"], "released_by": "si"}
    )

    assert response.status_code == 503
    assert response.json()["code"] == "PRINT_HTML2PDF_UNAVAILABLE"
    assert client.get(f"/api/documents/{DOCUMENT_ID}/releases").json() == []
    after = set(releases_root.iterdir()) if releases_root.exists() else set()
    assert after == before
