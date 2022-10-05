import asyncio
import json
import time
from datetime import datetime, timedelta, timezone

from jupyter_server.base.handlers import APIHandler
from tornado import web
from tornado.log import gen_log


class Spinner:
    def __init__(self, last_activity_times, spin_interval=60):
        self.last_activity_times = last_activity_times
        self.spinning = False
        self.spin_interval = spin_interval
        self._task = None
        self.deadline = None

    def start(self, seconds):
        """Start spinning

        Keep the Jupyter server active for `seconds` seconds.
        """
        self.stop()
        gen_log.info(f"Keeping Jupyter server active for {timedelta(seconds=seconds)}")
        self._task = asyncio.create_task(self._spin(seconds))

    async def _spin(self, seconds):
        start = time.monotonic()
        deadline = self.deadline = start + seconds
        while time.monotonic() < deadline:
            gen_log.debug("Setting keepalive activity")
            self.last_activity_times["jupyter-keepalive"] = datetime.now(timezone.utc)
            await asyncio.sleep(self.spin_interval)
        gen_log.info(f"Keepalive finished after {timedelta(seconds=seconds)}")

    def stop(self):
        """Stop keeping alive"""
        if self._task is not None and not self._task.done():
            gen_log.info("Stopping keepalive spinner")

            self._task.cancel()
        self._task = None

    @property
    def remaining(self):
        """Return the remaining time we're keeping alive (in seconds)

        Returns 0 if not running.
        """
        if self._task is None or self._task.done():
            return 0

        return max(int(self.deadline - time.monotonic()), 0)


DAY_SECONDS = 24 * 60 * 60


class KeepAliveHandler(APIHandler):
    def initialize(self):
        if "keepalive_spinner" not in self.settings:
            self.settings["keepalive_spinner"] = Spinner(
                self.settings["last_activity_times"]
            )
        self.spinner = self.settings["keepalive_spinner"]

    @web.authenticated
    def post(self):
        body = self.get_json_body()
        if not body:
            seconds = DAY_SECONDS
        else:
            seconds = body.get("seconds", DAY_SECONDS)
        self.spinner.start(seconds)

    @web.authenticated
    def delete(self):
        self.spinner.stop()

    @web.authenticated
    def get(self):
        self.write(json.dumps({"remaining": self.spinner.remaining}))
