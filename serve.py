#!/usr/bin/env python3
"""Static server that disables caching — so CSS/JS edits always show up."""
import http.server, socketserver
PORT = 8000
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
with socketserver.TCPServer(('127.0.0.1', PORT), NoCache) as httpd:
    print(f'Serving (no-cache) at http://127.0.0.1:{PORT}/')
    httpd.serve_forever()
