#!/usr/bin/env python3
# Check that sdist contains everything we expect

import tarfile
from functools import lru_cache
from pathlib import Path

import pytest

here = Path(__file__).parent.resolve()
dist = here.parent.joinpath("dist")

sdists = list(dist.glob("*.tar.gz"))


def test_sdist_exits():
    assert len(sdists) >= 1


@pytest.fixture(params=sdists)
@lru_cache
def file_list(request):
    filename = request.param
    with tarfile.open(name=filename, mode="r:gz") as tar:
        # Remove leading pkg-VERSION/
        return {f.partition("/")[2] for f in tar.getnames()}


@pytest.mark.parametrize(
    "filename",
    [
        "src/index.ts",
        "package.json",
        "README.md",
        "jupyter_keepalive/labextension/package.json",
    ],
)
def test_sdist_file(filename, file_list):
    assert filename in file_list
