import queue
import unittest

from services.job_runner.log_hub import LogHub


class TestLogHub(unittest.TestCase):
    def test_publish_and_subscribe(self) -> None:
        hub = LogHub(buffer_size=2)
        q, buffered = hub.subscribe("job1")

        self.assertEqual(buffered, [])

        hub.publish("job1", "line1")
        hub.publish("job1", "line2")
        hub.publish("job1", "line3")

        self.assertEqual(q.get_nowait(), "line1")
        self.assertEqual(q.get_nowait(), "line2")
        self.assertEqual(q.get_nowait(), "line3")

        with self.assertRaises(queue.Empty):
            q.get_nowait()

    def test_buffer_limits(self) -> None:
        hub = LogHub(buffer_size=1)
        hub.publish("job2", "first")
        hub.publish("job2", "second")
        q, buffered = hub.subscribe("job2")

        self.assertEqual(buffered, ["second"])
        hub.unsubscribe("job2", q)
