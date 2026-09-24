#!/usr/bin/env python3
"""Unpack CAYRNX_Design_mockup.html: the outer bundle, then the two nested page bundles.

    python3 design/prototype/extract-bundle.py CAYRNX_Design_mockup.html /tmp/proto
"""
import base64, gzip, json, os, re, sys


def tag(src, t):
    m = re.search(r'<script type="__bundler/%s"[^>]*>(.*?)</script>' % t, src, re.S)
    return m.group(1) if m else None


def extract(src, out):
    os.makedirs(out, exist_ok=True)
    manifest = json.loads(tag(src, 'manifest'))
    pages = json.loads(tag(src, 'page_order') or '[]')
    open(os.path.join(out, 'template.html'), 'w').write(json.loads(tag(src, 'template')))
    for uuid, e in manifest.items():
        b = base64.b64decode(e['data'])
        if e.get('compressed'):
            b = gzip.decompress(b)
        if uuid in pages:
            extract(b.decode('utf-8'), os.path.join(out, uuid[:8]))
        else:
            ext = e['mime'].split('/')[-1].replace('javascript', 'js')
            open(os.path.join(out, f'{uuid}.{ext}'), 'wb').write(b)


if __name__ == '__main__':
    extract(open(sys.argv[1], encoding='utf-8').read(), sys.argv[2])
