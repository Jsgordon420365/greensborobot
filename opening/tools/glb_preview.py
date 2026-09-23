# Offline turntable preview of a GLB (vertex splat w/ z-buffer), for inspecting the Rodin model.
import json,struct,io,sys,numpy as np
from PIL import Image
p=sys.argv[1]; out=sys.argv[2]
f=open(p,'rb').read(); l=struct.unpack('<I',f[12:16])[0]; j=json.loads(f[20:20+l]); b=f[20+l+8:]
def acc(i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; n={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']]
    dt={5126:np.float32,5125:np.uint32,5123:np.uint16}[a['componentType']]
    o=bv.get('byteOffset',0)+a.get('byteOffset',0); return np.frombuffer(b,dt,a['count']*n,o).reshape(-1,n) if n>1 else np.frombuffer(b,dt,a['count'],o)
pr=j['meshes'][0]['primitives'][0]; P=acc(pr['attributes']['POSITION']); UV=acc(pr['attributes']['TEXCOORD_0']); N=acc(pr['attributes']['NORMAL'])
img=j['images'][1]; bv=j['bufferViews'][img['bufferView']]; tex=np.array(Image.open(io.BytesIO(b[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB'))
th,tw=tex.shape[:2]; col=tex[np.clip((UV[:,1]*th).astype(int),0,th-1),np.clip((UV[:,0]*tw).astype(int),0,tw-1)].astype(float)
W=400; tiles=[]
for ang in [0,45,90,180,270]:
    a=np.radians(ang); R=np.array([[np.cos(a),0,np.sin(a)],[0,1,0],[-np.sin(a),0,np.cos(a)]])
    q=P@R.T; n=N@R.T; sh=np.clip(0.45+0.55*(n@np.array([0.3,0.5,0.8])),0.2,1)[:,None]
    x=((q[:,0]/2+0.5)*W).astype(int); y=((0.5-q[:,1]/2)*W).astype(int); z=q[:,2]
    o=np.argsort(z); im=np.full((W,W,3),40,float)
    for dx in (0,1):
        for dy in (0,1):
            xx=np.clip(x[o]+dx,0,W-1); yy=np.clip(y[o]+dy,0,W-1); im[yy,xx]=(col*sh)[o]
    tiles.append(im)
Image.fromarray(np.hstack(tiles).clip(0,255).astype(np.uint8)).save(out)
