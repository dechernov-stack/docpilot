from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app


@pytest.fixture()
def app(tmp_path: Path):
    return create_app(tmp_path / "docpilot.db", tmp_path / "repos")


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def service(app):
    return app.state.service

