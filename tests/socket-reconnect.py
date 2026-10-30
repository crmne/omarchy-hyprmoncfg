#!/usr/bin/env python3
"""Exercise the real QML error handlers against repeated local peer closures.

Run with python3 tests/socket-reconnect.py (requires quickshell and QtQuick).
Uses an isolated offscreen shell; does not contact hyprmoncfgd or change displays.
"""

import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import unittest


def error_handler(filename):
    source = filename.read_text()
    marker = "onError: function(error) "
    start = source.index(marker) + len(marker)
    end, depth = start + 1, 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


class SocketReconnectTest(unittest.TestCase):
    def test_peer_closure_and_reconnection(self):
        root = Path(__file__).resolve().parent.parent
        for filename in ("Panel.qml", "PreviewGuard.qml"):
            with self.subTest(handler=filename), tempfile.TemporaryDirectory(prefix="qs-reconnect-") as directory:
                path = Path(directory)
                with socket.socket(socket.AF_UNIX) as server:
                    server.bind(str(path / "peer.sock"))
                    server.listen(20)
                    server.settimeout(0.1)
                    stop = threading.Event()
                    peer_errors = []

                    def peer():
                        while not stop.is_set():
                            try:
                                connection, _ = server.accept()
                            except socket.timeout:
                                continue
                            try:
                                with connection:
                                    connection.sendall(b"probe\n")
                                    stop.wait(0.04)
                            except OSError as error:
                                peer_errors.append(str(error))

                    config = '''import QtQuick
import Quickshell
import Quickshell.Io
Scope {
  id: testRoot
  property int received: 0
  property int errors: 0
  Socket {
    id: backendSocket
    path: Quickshell.env("QS_TEST_SOCKET")
    connected: true
    parser: SplitParser {
      splitMarker: "\\n"
      onRead: function(line) {
        if (line === "probe") testRoot.received++
        console.log("SOCKET_TEST_DATA", line)
      }
    }
    onError: function(error) {
      testRoot.errors++
      ;(function(error) HANDLER)(error)
    }
  }
  Timer {
    interval: 100
    repeat: true
    running: !backendSocket.connected
    onTriggered: backendSocket.connected = true
  }
  Timer {
    interval: 20
    repeat: true
    running: true
    onTriggered: {
      if (testRoot.received >= 10 && testRoot.errors >= 10) {
        console.log("SOCKET_TEST_COMPLETE")
        Qt.quit()
      }
    }
  }
}
'''.replace("HANDLER", error_handler(root / filename))
                    (path / "shell.qml").write_text(config)
                    thread = threading.Thread(target=peer)
                    thread.start()
                    try:
                        # Set the core limit in a fresh interpreter, not preexec_fn:
                        # this parent already has a running socket-peer thread.
                        result = subprocess.run(
                            [sys.executable, "-c",
                             "import os, resource, sys; "
                             "resource.setrlimit(resource.RLIMIT_CORE, (0, 0)); "
                             "os.execvp(sys.argv[1], sys.argv[1:])",
                             "quickshell", "--no-color", "--path", str(path / "shell.qml")],
                            env={**os.environ, "QT_QPA_PLATFORM": "offscreen",
                                 "QT_QPA_PLATFORMTHEME": "", "QT_QUICK_BACKEND": "software",
                                 "QS_DISABLE_CRASH_HANDLER": "1", "QS_TEST_SOCKET": str(path / "peer.sock"),
                                 "XDG_CACHE_HOME": str(path / "cache"), "XDG_STATE_HOME": str(path / "state")},
                            capture_output=True, text=True, timeout=15,
                        )
                    finally:
                        stop.set()
                        thread.join(timeout=2)
                        self.assertFalse(thread.is_alive(), "socket peer failed to stop")
                    log = result.stdout + result.stderr
                    self.assertEqual(result.returncode, 0, log)
                    self.assertFalse(peer_errors, peer_errors)
                    self.assertIn("SOCKET_TEST_COMPLETE", log)
                    self.assertGreaterEqual(log.count("PeerClosedError"), 10, log)
                    self.assertGreaterEqual(log.count("SOCKET_TEST_DATA probe"), 10, log)


if __name__ == "__main__":
    unittest.main()
