__version__ = "0.0.1.dev"

from jupyter_server.utils import url_path_join

from .handlers import KeepAliveHandler


def _jupyter_server_extension_points():
    return [{"module": "jupyter_keepalive"}]


def _load_jupyter_server_extension(serverapp):
    web_app = serverapp.web_app
    host_pattern = ".*$"
    route_pattern = url_path_join(web_app.settings["base_url"], r"/api/ext-keepalive")
    web_app.add_handlers(host_pattern, [(route_pattern, KeepAliveHandler)])
