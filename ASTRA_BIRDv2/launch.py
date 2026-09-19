import argparse,threading,webbrowser,sys
from server import Store,Handler,ThreadingHTTPServer
def run():
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8770);p.add_argument('--no-browser',action='store_true');args=p.parse_args()
 server=None
 for port in range(args.port,args.port+20):
  try:server=ThreadingHTTPServer(('127.0.0.1',port),Handler);break
  except OSError:continue
 if server is None:raise RuntimeError('No available local port. Close a previous ASTRA window and retry.')
 server.store=Store()
 url='http://127.0.0.1:'+str(server.server_port)
 print('ASTRA dashboard: '+url,flush=True)
 print('Keep this window open. Press Ctrl+C to stop.',flush=True)
 if not args.no_browser:threading.Timer(.4,lambda:webbrowser.open(url)).start()
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close()
if __name__=='__main__':
 try:run()
 except Exception as e:print('Startup failed: '+str(e),file=sys.stderr);sys.exit(1)
