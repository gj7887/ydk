#!/usr/bin/env python3
"""Simple static HTTP server with CORS support.

Usage:
  python3 server.py -p 8787 -d .

This server serves files from the given directory and adds CORS headers
and basic OPTIONS handling to avoid preflight failures.
"""

import argparse
import http.server
import socketserver
import os
import sys


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    # Add CORS headers to all responses
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    # Handle preflight requests
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    # Simple mock for /api/music-proxy to support local frontend testing
    def do_GET(self):
        if self.path.startswith('/api/music-proxy'):
            from urllib.parse import urlparse, parse_qs, unquote
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            types = qs.get('types', ['search'])[0]

            # Basic search mock
            if types == 'search':
                name = unquote(qs.get('name', [''])[0])
                page = int(qs.get('pages', ['1'])[0])
                # produce 6 mock songs
                songs = []
                for i in range(6):
                    idx = (page - 1) * 6 + i + 1
                    songs.append({
                        'id': f'mock-{idx}',
                        'name': f'{name or "示例歌曲"} {idx}',
                        'artist': '示例歌手',
                        'pic': 'https://placehold.co/300x300?text=Cover',
                        'source': 'mock'
                    })

                body = {
                    'songs': songs,
                    'page': page,
                    'total_pages': 5
                }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                import json
                self.wfile.write(json.dumps(body, ensure_ascii=False).encode('utf-8'))
                return

            if types == 'url':
                # return a mock playable URL (point to a short sample file or same origin)
                body = {'url': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                import json
                self.wfile.write(json.dumps(body).encode('utf-8'))
                return

            if types == 'lyric':
                body = {'lyric': ''}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                import json
                self.wfile.write(json.dumps(body, ensure_ascii=False).encode('utf-8'))
                return

            # Proxy target URL (stream remote content through this server)
            target = qs.get('target', [None])[0]
            if target:
                # Stream the remote resource to the client
                try:
                    import urllib.request
                    req = urllib.request.Request(target, headers={'User-Agent': 'ydk-local-proxy/1.0'})
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        self.send_response(200)
                        # Copy some headers
                        ctype = resp.headers.get_content_type()
                        if ctype:
                            self.send_header('Content-Type', ctype)
                        clen = resp.headers.get('Content-Length')
                        if clen:
                            self.send_header('Content-Length', clen)
                        self.end_headers()
                        # Stream in chunks
                        chunk = resp.read(8192)
                        while chunk:
                            self.wfile.write(chunk)
                            chunk = resp.read(8192)
                    return
                except Exception as e:
                    self.send_response(502)
                    self.send_header('Content-Type', 'text/plain; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(f'Error proxying target: {e}'.encode('utf-8'))
                    return

        # Fallback to default static file handling
        return super().do_GET()


def main():
    parser = argparse.ArgumentParser(description='Simple static HTTP server with CORS')
    parser.add_argument('-p', '--port', type=int, default=8787, help='Port to serve on')
    parser.add_argument('-d', '--dir', default=os.getcwd(), help='Directory to serve')
    args = parser.parse_args()

    serve_dir = args.dir
    if not os.path.isdir(serve_dir):
        print(f"Warning: directory '{serve_dir}' not found. Serving current working directory instead.")
        serve_dir = os.getcwd()

    os.chdir(serve_dir)

    handler_class = CORSRequestHandler
    with socketserver.TCPServer(("", args.port), handler_class) as httpd:
        host = 'localhost'
        print(f"🚀 Server running at http://{host}:{args.port}")
        print(f"📁 Serving from: {serve_dir}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nShutting down server...')
            httpd.server_close()


if __name__ == '__main__':
    main()
