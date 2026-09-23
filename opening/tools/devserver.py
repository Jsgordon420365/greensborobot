# Static server + POST /__frame?name=x.png saves canvas captures into <root>/versions/frames/ (review only).
# usage: python devserver.py [port] [root]   e.g. python opening/tools/devserver.py 8767 dist
import http.server, os, base64, urllib.parse, sys
ROOT=os.path.abspath(sys.argv[2]) if len(sys.argv)>2 else os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def end_headers(s): s.send_header('Cache-Control','no-store'); super().end_headers()
    def do_POST(s):
        q=urllib.parse.parse_qs(urllib.parse.urlparse(s.path).query); name=os.path.basename(q.get('name',['frame.png'])[0])
        d=s.rfile.read(int(s.headers['Content-Length'])).decode(); d=d.split(',',1)[-1]
        os.makedirs(os.path.join(ROOT,'versions','frames'),exist_ok=True)
        open(os.path.join(ROOT,'versions','frames',name),'wb').write(base64.b64decode(d))
        s.send_response(200); s.end_headers(); s.wfile.write(b'ok')
    def log_message(s,*a): pass
http.server.ThreadingHTTPServer(('127.0.0.1',int(sys.argv[1]) if len(sys.argv)>1 else 8765),H).serve_forever()
