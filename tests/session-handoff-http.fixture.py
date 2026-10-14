"""Loopback-only HTTP fixture with synthetic verified identity; never production auth."""
import pathlib,sys,socket,json
from types import SimpleNamespace
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from session_handoff import Coordinator
from hermes_handoff_router import create_router
from fastapi import FastAPI
import uvicorn
app=FastAPI();app.state.auth_required=True
@app.middleware('http')
async def fixture_auth(request,call_next):
    if request.cookies.get('handoff_fixture')=='fixture':
        request.state.session=SimpleNamespace(user_id='test-user',provider='fixture')
    return await call_next(request)
app.include_router(create_router(Coordinator(sys.argv[1]),authorize_profile=lambda request,profile:profile=='default',authorize_session=lambda request,session:session['id'] in ['qa-pc','qa-notebook']))
listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen(16)
print(json.dumps({'port':listener.getsockname()[1]}),flush=True)
uvicorn.Server(uvicorn.Config(app,log_level='critical',access_log=False)).run(sockets=[listener])
