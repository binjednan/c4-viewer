#!/usr/bin/env python3
"""Build the C4 vector viewer against the unchanged, verified source-resource release.

Run: python3 scripts/build_verified_site.py --archive c4-site.zip --output _site
The archive supplies immutable resource packs, the original SQLite baseline, and
the already bundled sql.js runtime. All current UI code comes from src/.
"""
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
import zipfile

BASE_SHA256 = '5395e01a3836ce90b976fcfca8e531a3087aee77b1988b5ab346a8b53858c631'
DATABASE_SHA256 = 'dd69382278c0fd72c215c9c56e591aff0d76c19c737adaca23408eec6286224d'
SCRIPTS = ('classification.js', 'store.js', 'web-resources.js', 'vector-engine.js', 'app.js')


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.values = []
        self.inside = False

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.inside = True
            self.values.append('')

    def handle_endtag(self, tag):
        if tag == 'script':
            self.inside = False

    def handle_data(self, data):
        if self.inside:
            self.values[-1] += data


def setting(scripts, name):
    prefix = 'window.' + name + '='
    values = [s.strip() for s in scripts if s.strip().startswith(prefix)]
    if len(values) != 1:
        raise ValueError('Missing or duplicate runtime setting: ' + name)
    return json.loads(values[0][len(prefix):].rstrip(';'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--source', type=Path, default=Path('src'))
    args = parser.parse_args()
    with args.archive.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != BASE_SHA256:
            raise SystemExit('Base resources do not match the approved original release.')
    args.output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.archive) as bundle:
        names = bundle.namelist()
        if len(names) != 23 or not {'index.html', 'project.c4db.gz', '.nojekyll'} <= set(names):
            raise SystemExit('Unexpected base-resource package.')
        if any(Path(name).name != name for name in names):
            raise SystemExit('Only root-level base-resource entries are allowed.')
        original = bundle.read('index.html').decode('utf-8')
        for name in names:
            if name not in ('index.html', 'README.md'):
                (args.output / name).write_bytes(bundle.read(name))
    scripts = Scripts()
    scripts.feed(original)
    vendor = setting(scripts.values, 'C4_VENDOR')
    hosted = setting(scripts.values, 'C4_HOSTED_PROJECT')
    if hosted['sha256'] != DATABASE_SHA256:
        raise SystemExit('Unexpected baseline database.')
    sql = scripts.values[0]
    if 'initSqlJs' not in sql:
        raise SystemExit('Missing original sql.js runtime.')
    parts = ['<script>' + sql + '</script>']
    parts.append('<script>window.C4_VENDOR=' + json.dumps({'sqlWasm': vendor['sqlWasm']}, separators=(',', ':')) + ';</script>')
    parts.append('<script>window.C4_HOSTED_PROJECT=' + json.dumps(hosted, separators=(',', ':')) + ';</script>')
    for name in SCRIPTS:
        source = (args.source / name).read_text()
        parts.append('<script>' + source.replace('</script', '<\\/script') + '</script>')
    shell = (args.source / 'shell.html').read_text()
    if shell.count('<!-- C4_VENDOR_AND_APP -->') != 1:
        raise SystemExit('Missing or duplicate app bootstrap placeholder.')
    index = shell.replace('<!-- C4_VENDOR_AND_APP -->', '\n'.join(parts) + '\n')
    (args.output / 'index.html').write_text(index)
    if Path('README.md').exists():
        (args.output / 'README.md').write_bytes(Path('README.md').read_bytes())
    report = {'renderer': 'direct-svg', 'base_archive_sha256': BASE_SHA256,
              'baseline_database_sha256': DATABASE_SHA256,
              'index_sha256': hashlib.sha256(index.encode()).hexdigest(),
              'index_bytes': len(index.encode()),
              'sources': {name: hashlib.sha256((args.source / name).read_bytes()).hexdigest() for name in (*SCRIPTS, 'shell.html')}}
    (args.output / 'build.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
