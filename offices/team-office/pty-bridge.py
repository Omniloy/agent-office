#!/usr/bin/env python3
"""pty-bridge: runs a program inside a real terminal (pty) for term.mjs. Keys come in on stdin, the screen goes out
on stdout, and "cols rows\n" lines on file descriptor 3 resize it. Ends when the program ends or stdin closes."""
import os, pty, sys, select, fcntl, termios, struct, signal
argv = sys.argv[1:] or [os.environ.get("SHELL", "/bin/bash"), "-l"]
pid, fd = pty.fork()
if pid == 0:
    try: os.execvp(argv[0], argv)
    except Exception as e: os.write(2, f"could not start {argv[0]}: {e}\r\n".encode()); os._exit(127)
def resize(cols, rows):
    try: fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", max(2, rows), max(10, cols), 0, 0))
    except Exception: pass
resize(100, 30)
ins = [0, fd, 3]; ctl = b""
def write_all(f, d):
    while d:
        try: d = d[os.write(f, d):]
        except InterruptedError: pass
try:
    while True:
        r, _, _ = select.select(ins, [], [])
        if fd in r:
            try: d = os.read(fd, 65536)
            except OSError: break
            if not d: break
            write_all(1, d)
        if 0 in r:
            d = os.read(0, 65536)
            if not d: break
            write_all(fd, d)
        if 3 in r:
            d = os.read(3, 4096)
            if not d: ins.remove(3)
            ctl += d
            while b"\n" in ctl:
                line, ctl = ctl.split(b"\n", 1)
                try: c, w = line.split(); resize(int(c), int(w))
                except Exception: pass
except (KeyboardInterrupt, BrokenPipeError, OSError):
    pass
finally:
    try: os.kill(pid, signal.SIGHUP)
    except Exception: pass
    try: os.waitpid(pid, 0)
    except Exception: pass
