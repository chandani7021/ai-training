#!/bin/bash
# Start the RQ worker in the background
python worker.py &

# Start the FastAPI server in the foreground (keeps the process alive)
uvicorn app.main:app --host 0.0.0.0 --port $PORT
