import asyncio
from datetime import datetime, timezone
from functools import partial

from jupyter_keepalive.handlers import Spinner

utcnow = partial(datetime.now, timezone.utc)


async def test_spinner():
    times = {}
    start = utcnow()
    spinner = Spinner(times, spin_interval=0.1)
    assert spinner.remaining == 0
    spinner.start(2)
    assert spinner._task is not None
    await asyncio.sleep(0.5)
    assert 1 <= spinner.remaining <= 2
    step_1 = times["jupyter-keepalive"]
    assert step_1 > start
    await asyncio.sleep(0.5)
    step_2 = times["jupyter-keepalive"]
    assert step_2 > step_1
    await spinner._task
    spinner.stop()
    assert spinner._task is None
    assert spinner.remaining == 0


async def test_spinner_stop():
    times = {}
    start = utcnow()
    spinner = Spinner(times, spin_interval=1)
    spinner.start(5)
    await asyncio.sleep(0.1)
    task = spinner._task
    spinner.stop()
    await asyncio.sleep(0.1)
    assert spinner._task is None
    assert task.done()
