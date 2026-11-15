"""Read NISAR HDF5 products over HTTPS byte ranges, so only the needed subset leaves the archive.

Authentication: NASA Earthdata Login through the user's ~/.netrc (or %USERPROFILE%\_netrc), entry
`machine urs.earthdata.nasa.gov`. `requests` reads it itself; this module never sees or logs the
credentials. The first request follows ASF's redirect chain (ASF -> URS -> signed CloudFront/S3 URL);
later ranged reads go straight to the signed URL, which is refreshed when it expires.
"""
import concurrent.futures
import io
import threading
import time
import zlib

import numpy as np
import requests

BLOCK = 1024 * 1024              # bytes per cached block; NISAR HDF5 products use large chunks and paged metadata
MAX_BLOCKS = 256                 # ~256 MB LRU cache per open file (metadata and small datasets)


class Stats:
    def __init__(self):
        self.bytes = 0
        self.requests = 0
        self.lock = threading.Lock()

    def add(self, n):
        with self.lock:
            self.bytes += n
            self.requests += 1


STATS = Stats()                  # process-wide counter: how much was actually transferred


def session():
    s = requests.Session()
    s.headers['User-Agent'] = 'groundline-subsidence/2.0 (open-source NASA Space Apps project)'
    s.trust_env = True           # lets requests pick up the netrc for urs.earthdata.nasa.gov on redirect
    return s


class RangeFile(io.RawIOBase):
    """Seekable, read-only file over HTTP Range requests with a small block cache."""

    def __init__(self, url, sess=None, block=BLOCK, max_blocks=MAX_BLOCKS):
        self.url, self.sess = url, sess or session()
        self.block, self.max_blocks = block, max_blocks
        self.pos, self.cache, self.order = 0, {}, []
        self.signed, self.signed_at, self.size = None, 0.0, None
        self.lock = threading.Lock()
        self.bytes = 0                   # bytes transferred for this file only
        self._resolve()

    def _resolve(self):
        """Follow the auth redirects once with a 1-byte range; remember the signed URL and the size."""
        for attempt in range(4):
            try:
                r = self.sess.get(self.url, headers={'Range': 'bytes=0-0'}, allow_redirects=True, timeout=120)
                if r.status_code in (200, 206):
                    break
                if r.status_code == 401:
                    raise PermissionError('Earthdata login refused (check the netrc entry for urs.earthdata.nasa.gov)')
                raise IOError('HTTP %d resolving %s' % (r.status_code, self.url.rsplit('/', 1)[-1]))
            except (requests.ConnectionError, requests.Timeout):
                if attempt == 3:
                    raise
                time.sleep(5 * (attempt + 1))
        self.signed, self.signed_at = r.url, time.time()
        cr = r.headers.get('Content-Range', '')
        self.size = int(cr.rsplit('/', 1)[-1]) if '/' in cr else int(r.headers.get('Content-Length', 0))
        r.close()

    def _fetch(self, index):
        start = index * self.block
        end = min(start + self.block, self.size) - 1
        for attempt in range(5):
            if time.time() - self.signed_at > 40 * 60:
                self._resolve()
            try:
                r = self.sess.get(self.signed, headers={'Range': 'bytes=%d-%d' % (start, end)}, timeout=180)
                if r.status_code == 206:
                    data = r.content
                    STATS.add(len(data))
                    self.bytes += len(data)
                    return data
                if r.status_code in (403, 400):          # signature expired
                    self._resolve()
                    continue
                raise IOError('HTTP %d for range %d-%d' % (r.status_code, start, end))
            except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError):
                if attempt == 4:
                    raise
                time.sleep(4 * (attempt + 1))
        raise IOError('could not read range %d-%d' % (start, end))

    def read_exact(self, offset, size):
        """Exactly these bytes, uncached (thread-safe: one stateless request)."""
        for attempt in range(5):
            if time.time() - self.signed_at > 40 * 60:
                with self.lock:
                    if time.time() - self.signed_at > 40 * 60:
                        self._resolve()
            try:
                r = self.sess.get(self.signed, headers={'Range': 'bytes=%d-%d' % (offset, offset + size - 1)}, timeout=180)
                if r.status_code == 206 and len(r.content) == size:
                    STATS.add(size)
                    with self.lock:
                        self.bytes += size
                    return r.content
                if r.status_code in (400, 403):
                    with self.lock:
                        self._resolve()
                    continue
            except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError):
                pass
            time.sleep(3 * (attempt + 1))
        raise IOError('could not read %d bytes at %d' % (size, offset))

    def _get_block(self, index):
        if index in self.cache:
            self.order.remove(index)
            self.order.append(index)
            return self.cache[index]
        data = self._fetch(index)
        self.cache[index] = data
        self.order.append(index)
        while len(self.order) > self.max_blocks:
            del self.cache[self.order.pop(0)]
        return data

    # --- io.RawIOBase interface used by h5py's file-like driver
    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def readinto(self, buf):
        n = min(len(buf), max(self.size - self.pos, 0))
        out, done = memoryview(buf), 0
        while done < n:
            index, inner = divmod(self.pos + done, self.block)
            data = self._get_block(index)
            take = min(len(data) - inner, n - done)
            out[done:done + take] = data[inner:inner + take]
            done += take
        self.pos += n
        return n


def open_h5(url, sess=None):
    """-> (h5py.File over HTTP, its RangeFile). Read big image layers with read_region(rf, ...)."""
    import h5py
    rf = RangeFile(url, sess)
    return h5py.File(rf, 'r', rdcc_nbytes=0), rf


# ---------------------------------------------------------------- exact chunk reads, in parallel
# h5py reads chunk by chunk through the file object, one round trip each. For the big image layers we
# instead ask the HDF5 chunk index where each needed chunk lives, fetch exactly those bytes in parallel,
# and undo the filters (shuffle + deflate, the only ones NISAR uses) ourselves.

def _unshuffle(raw, itemsize):
    if itemsize == 1:
        return raw
    a = np.frombuffer(raw, np.uint8)
    n = len(a) // itemsize
    return a[:n * itemsize].reshape(itemsize, n).T.copy().tobytes() + raw[n * itemsize:]


def read_region(rf, dset, rows, cols, lead=None, workers=8):
    """dset[lead..., rows, cols] for a gzip(+shuffle) chunked dataset opened through RangeFile.

    rows, cols: slices with step 1. lead: optional index for a leading axis (3-D cubes) or None.
    """
    if rf is None or dset.compression not in ('gzip', None) or dset.fletcher32 or dset.scaleoffset:
        return dset[(lead if not isinstance(lead, (list, tuple)) else sorted(lead), rows, cols) if lead is not None else (Ellipsis, rows, cols)]
    chunks = dset.chunks
    ch, cw = chunks[-2], chunks[-1]
    r0, r1, c0, c1 = rows.start, rows.stop, cols.start, cols.stop
    many = dset.ndim == 3 and (lead is None or isinstance(lead, (list, tuple)))
    leads = [None] if dset.ndim == 2 else (range(dset.shape[0]) if lead is None else list(lead) if many else [lead])
    out = np.full(((len(leads),) if many else ()) + (r1 - r0, c1 - c0),
                  dset.fillvalue, dset.dtype)
    jobs = []
    for li, L in enumerate(leads):
        for cr in range((r0 // ch) * ch, r1, ch):
            for cc in range((c0 // cw) * cw, c1, cw):
                coord = (cr, cc) if L is None else (L, cr, cc)
                info = dset.id.get_chunk_info_by_coord(coord)
                if info.byte_offset is None:
                    continue
                jobs.append((li, cr, cc, info))
    itemsize, shuffle, gz = dset.dtype.itemsize, dset.shuffle, dset.compression == 'gzip'

    def fetch(job):
        li, cr, cc, info = job
        raw = rf.read_exact(info.byte_offset, info.size)
        if gz and not (info.filter_mask & 1 << (1 if shuffle else 0)):
            raw = zlib.decompress(raw)
        if shuffle and not (info.filter_mask & 1):
            raw = _unshuffle(raw, itemsize)
        block = np.frombuffer(raw, dset.dtype).reshape(ch, cw)
        rs, re_ = max(r0, cr), min(r1, cr + ch)
        cs, ce = max(c0, cc), min(c1, cc + cw)
        target = out[li] if out.ndim == 3 else out
        target[rs - r0:re_ - r0, cs - c0:ce - c0] = block[rs - cr:re_ - cr, cs - cc:ce - cc]

    with concurrent.futures.ThreadPoolExecutor(workers) as pool:
        list(pool.map(fetch, jobs))
    return out
