__version__ = "0.2.0"


from jupyter_server.utils import url_path_join

from .handlers import KeepAliveHandler


def _jupyter_labextension_paths():
    import json
    from pathlib import Path

    _HERE = Path(__file__).parent.resolve()

    with (_HERE / "labextension" / "package.json").open() as f:
        pkg = json.load(f)
    return [{"src": "labextension", "dest": pkg["name"]}]


def _jupyter_server_extension_points():
    return [{"module": "jupyter_keepalive"}]


def _load_jupyter_server_extension(serverapp):
    web_app = serverapp.web_app
    host_pattern = ".*$"
    route_pattern = url_path_join(web_app.settings["base_url"], r"/ext-keepalive")
    web_app.add_handlers(host_pattern, [(route_pattern, KeepAliveHandler)])
