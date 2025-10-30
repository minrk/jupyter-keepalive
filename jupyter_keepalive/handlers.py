import asyncio
import json
import time
from datetime import datetime, timedelta, timezone

from jupyter_server.base.handlers import APIHandler
from tornado import web


class Spinner:
    def __init__(self, last_activity_times, logger, spin_interval=60):
        self.last_activity_times = last_activity_times
        self.logger = logger
        self.spinning = False
        self.spin_interval = spin_interval
        self._task = None
        self.deadline = None

    def start(self, seconds):
        """Start spinning

        Keep the Jupyter server active for `seconds` seconds.
        """
        self.stop()
        self.logger.info(f"Keeping Jupyter server active for {timedelta(seconds=seconds)}")
        start = time.monotonic()
        self.deadline = start + seconds
        self._task = asyncio.create_task(self._spin(seconds))

    async def _spin(self, seconds):
        deadline = self.deadline or 0
        while time.monotonic() < deadline:
            self.logger.debug("Setting keepalive activity")
            self.last_activity_times["jupyter-keepalive"] = datetime.now(timezone.utc)
            await asyncio.sleep(self.spin_interval)
        self.logger.info(f"Keepalive finished after {timedelta(seconds=seconds)}")

    def stop(self):
        """Stop keeping alive"""
        if self._task is not None and not self._task.done():
            self.logger.info("Stopping keepalive spinner")
            self._task.cancel()
        self.deadline = None
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
    def initialize(self, logger=None):
        if "keepalive_spinner" not in self.settings:
            self.settings["keepalive_spinner"] = Spinner(
                self.settings["last_activity_times"],
                logger=logger
            )
        self.spinner = self.settings["keepalive_spinner"]

    @property
    def _state(self):
        return {"remaining": self.spinner.remaining}

    def _write_state(self):
        """Write the current state as JSON reply"""
        self.write(json.dumps(self._state))

    @web.authenticated
    def post(self):
        body = self.get_json_body()
        if not body:
            seconds = DAY_SECONDS
        else:
            seconds = body.get("seconds", DAY_SECONDS)
        self.spinner.start(seconds)
        self._write_state()

    @web.authenticated
    def delete(self):
        self.spinner.stop()

    @web.authenticated
    def get(self):
        self._write_state()
