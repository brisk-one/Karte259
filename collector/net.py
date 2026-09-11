"""HTTP-Abrufe mit Wiederholung, festem User-Agent und gzip-Erkennung (nur Standardbibliothek)."""
import gzip
import time
import urllib.error
import urllib.request

from . import config


class FetchError(Exception):
    pass


class Counter:
    """Zählt alle Abrufe eines Laufs, damit die Last im Run-Log belegbar ist."""
    world = 0
    guest = 0


def fetch(url, headers=None, retries=3, timeout=60, kind="world"):
    """Gibt (status, body, response_headers) zurück. 304 wird ohne Fehler durchgereicht."""
    h = {"User-Agent": config.USER_AGENT, "Accept-Encoding": "identity"}
    if headers:
        h.update(headers)
    last = None
    for attempt in range(retries):
        if kind == "guest":
            Counter.guest += 1
        else:
            Counter.world += 1
        req = urllib.request.Request(url, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read(), dict(resp.headers)
        except urllib.error.HTTPError as e:
            if e.code == 304:
                return 304, b"", dict(e.headers)
            last = f"HTTP {e.code}"
            if e.code in (401, 403, 404, 410):
                break
        except Exception as e:  # Netzwerkfehler, Timeout
            last = repr(e)
        time.sleep(2 * (attempt + 1))
    raise FetchError(f"{url}: {last}")


def maybe_gunzip(body):
    return gzip.decompress(body) if body[:2] == b"\x1f\x8b" else body
