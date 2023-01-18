#!/usr/bin/env python
# Check that installed package contains everything we expect


import json
import sys
from pathlib import Path

import pytest
from jupyter_server.serverapp import ServerApp

import jupyter_keepalive

labextension = Path(jupyter_keepalive.__file__).parent.resolve() / "labextension"
etc = Path(sys.prefix) / "etc"
share = Path(sys.prefix) / "share"


def test_labextension():
    assert labextension.is_dir()
    with (labextension / "package.json").open() as f:
        package_json = json.load(f)

    entrypoint = labextension / package_json["jupyterlab"]["_build"]["load"]
    assert entrypoint.is_file()


@pytest.mark.parametrize(
    "path",
    [
        "jupyter/jupyter_server_config.d/jupyter_keepalive.json",
    ],
)
def test_etc(path):
    etc_path = etc / path
    assert etc_path.is_file()


def test_server_extension():
    app = ServerApp()
    app.initialize(argv=[])
    assert "jupyter_keepalive" in app.extension_manager.extensions
    assert app.extension_manager.extensions["jupyter_keepalive"].enabled
