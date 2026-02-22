"""
Start the RQ worker.

Usage:
    python worker.py

Make sure Redis is running and the .env file is in place.
"""
import os
import sys

# On macOS, the Objective-C runtime initializes at Python startup (before any
# Python code runs). When RQ later calls fork(), the OS detects ObjC was
# mid-init in another thread and kills the child with SIGABRT.
# Fix: set the flag and re-exec this process so it takes effect from the start.
if os.uname().sysname == "Darwin" and "OBJC_DISABLE_INITIALIZE_FORK_SAFETY" not in os.environ:
    os.environ["OBJC_DISABLE_INITIALIZE_FORK_SAFETY"] = "YES"
    os.execv(sys.executable, [sys.executable] + sys.argv)

from redis import Redis
from rq import Worker, Queue
from app.config import get_settings

settings = get_settings()

redis_conn = Redis.from_url(settings.REDIS_URL)
queues = [Queue(connection=redis_conn)]

if __name__ == "__main__":
    worker = Worker(queues, connection=redis_conn)
    worker.work(with_scheduler=True)
