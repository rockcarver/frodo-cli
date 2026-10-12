#!/usr/bin/env python3
import json
import os
import pty
import re
import select
import signal
import sys
import time

ANSI_ESCAPE_CODES = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")

KEYS = {
    "tab": "\t",
    "up": "\x1b[A",
    "down": "\x1b[B",
    "right": "\x1b[C",
    "left": "\x1b[D",
    "ctrl_d": "\x04",
    "enter": "\r",
    "ctrl_e": "\x05",
    "ctrl_u": "\x15",
    "backspace": "\x7f",
    "escape": "\x1b",
    "space": " ",
}


def strip_ansi(text: str) -> str:
    return ANSI_ESCAPE_CODES.sub("", text).replace("\r", "").replace("\x08", "")


class PtyScenarioRunner:
    def __init__(self, scenario):
        self.command = scenario["command"]
        self.cwd = scenario["cwd"]
        self.home_dir = scenario["homeDir"]
        # The runner's env merges UNDER the scenario env (jest's
        # FRODO_TEST/NO_COLOR must be overridable), but some color
        # detectors (tinyrainbow) disable on mere PRESENCE of NO_COLOR --
        # an empty value does not re-enable color. A scenario value of
        # the DELETE sentinel removes the key from the child's env
        # entirely (unset, not blank).
        self.env = {
            key: value
            for key, value in {**os.environ, **scenario.get("env", {})}.items()
            if value != "__FRODO_PTY_DELETE__"
        }
        self.env["HOME"] = self.home_dir
        self.env["USERPROFILE"] = self.home_dir
        self.actions = scenario["actions"]
        self.output = ""
        self.captures = {}
        self.child_pid = None
        self.fd = None

    def start(self):
        pid, fd = pty.fork()
        if pid == 0:
            os.chdir(self.cwd)
            os.execvpe(self.command[0], self.command, self.env)
        # Pin the terminal size: under jest the driver has no controlling
        # tty, so the forked pty would inherit a default (e.g. 80x24 from
        # the runner); prompts then wrap lines differently than on a
        # developer terminal and captures become width-dependent. A fixed
        # 120x40 keeps scenario frames deterministic everywhere.
        import fcntl
        import struct
        import termios

        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
        self.child_pid = pid
        self.fd = fd

    def _read_once(self, timeout_seconds=0.05):
        readable, _, _ = select.select([self.fd], [], [], timeout_seconds)
        if self.fd not in readable:
            return False
        try:
            data = os.read(self.fd, 4096)
        except OSError:
            return False
        if not data:
            return False
        self.output += data.decode("utf-8", errors="replace")
        return True

    def _write(self, data):
        # The child may exit mid-scenario (e.g. the flow concluded before
        # every scripted key was spent) -- a write to the closed pty raises
        # EIO. Absorb it like the read path does: the keys are lost, but
        # the capture already reflects the concluded run.
        try:
            os.write(self.fd, data)
        except OSError:
            pass

    def _wait_for_match(self, matcher, plain=False, timeout_ms=10000):
        deadline = time.time() + timeout_ms / 1000.0
        compiled = re.compile(matcher)
        while time.time() < deadline:
            self._read_once()
            haystack = strip_ansi(self.output) if plain else self.output
            if compiled.search(haystack):
                return haystack
            time.sleep(0.02)
        raise TimeoutError(f"Timed out waiting for {matcher}.\nCaptured output:\n{strip_ansi(self.output)}")

    def _drain_for(self, duration_ms):
        deadline = time.time() + duration_ms / 1000.0
        while time.time() < deadline:
            self._read_once(0.02)
            time.sleep(0.01)

    def run(self):
        self.start()
        for action in self.actions:
            kind = action["type"]
            if kind == "wait_prompt":
                self._wait_for_match(r">\s$", plain=True, timeout_ms=action.get("timeoutMs", 10000))
            elif kind == "wait_plain":
                self._wait_for_match(action["regex"], plain=True, timeout_ms=action.get("timeoutMs", 10000))
            elif kind == "clear_output":
                self.output = ""
            elif kind == "send":
                self._write(action["text"].encode("utf-8"))
            elif kind == "send_line":
                self._write((action["text"] + "\r").encode("utf-8"))
            elif kind == "key":
                self._write(KEYS[action["name"]].encode("utf-8"))
            elif kind == "sleep":
                self._drain_for(action.get("ms", 100))
            elif kind == "capture":
                self.captures[action["label"]] = {
                    "raw": self.output,
                    "plain": strip_ansi(self.output),
                }
            else:
                raise ValueError(f"Unknown action type: {kind}")

        self._shutdown()
        return {
            "rawOutput": self.output,
            "plainOutput": strip_ansi(self.output),
            "captures": self.captures,
        }

    def _shutdown(self):
        try:
            os.write(self.fd, KEYS["ctrl_d"].encode("utf-8"))
        except OSError:
            pass

        deadline = time.time() + 2.0
        while time.time() < deadline:
            self._drain_for(50)
            try:
                waited_pid, _status = os.waitpid(self.child_pid, os.WNOHANG)
                if waited_pid == self.child_pid:
                    return
            except OSError:
                return

        try:
            os.write(self.fd, KEYS["ctrl_e"].encode("utf-8"))
            os.write(self.fd, KEYS["ctrl_u"].encode("utf-8"))
            os.write(self.fd, b".exit\r")
        except OSError:
            pass

        deadline = time.time() + 1.0
        while time.time() < deadline:
            self._drain_for(50)
            try:
                waited_pid, _status = os.waitpid(self.child_pid, os.WNOHANG)
                if waited_pid == self.child_pid:
                    return
            except OSError:
                return

        try:
            os.kill(self.child_pid, signal.SIGTERM)
        except OSError:
            pass

        try:
            os.waitpid(self.child_pid, 0)
        except OSError:
            pass


def main():
    scenario = json.load(sys.stdin)
    result = PtyScenarioRunner(scenario).run()
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()