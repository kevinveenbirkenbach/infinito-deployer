from __future__ import annotations

import queue
import threading
from collections import deque
from typing import Deque, Dict, List, Tuple


class LogHub:
    def __init__(self, *, buffer_size: int = 200) -> None:
        self._lock = threading.Lock()
        self._buffers: Dict[str, Deque[str]] = {}
        self._subscribers: Dict[str, List[queue.Queue[str]]] = {}
        self._buffer_size = buffer_size

    def publish(self, job_id: str, line: str) -> None:
        with self._lock:
            buf = self._buffers.setdefault(job_id, deque(maxlen=self._buffer_size))
            buf.append(line)
            subscribers = list(self._subscribers.get(job_id, []))

        for q in subscribers:
            try:
                q.put_nowait(line)
            except queue.Full:
                # Drop line for slow consumers.
                continue

    def subscribe(self, job_id: str) -> Tuple[queue.Queue[str], List[str]]:
        q: queue.Queue[str] = queue.Queue(maxsize=1000)
        with self._lock:
            self._subscribers.setdefault(job_id, []).append(q)
            buf = list(self._buffers.get(job_id, deque()))
        return q, buf

    def unsubscribe(self, job_id: str, q: queue.Queue[str]) -> None:
        with self._lock:
            subs = self._subscribers.get(job_id)
            if not subs:
                return
            self._subscribers[job_id] = [s for s in subs if s is not q]
            if not self._subscribers[job_id]:
                self._subscribers.pop(job_id, None)
