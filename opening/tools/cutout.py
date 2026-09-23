# Cut canonical greensborobot poses out of the reference lineup (black bg) and the seated close-up (navy bg).
# Background removal = flood fill from the border over near-background pixels, so dark eyes/nose/feet inside survive.
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
def cut(im, bg, tol):
    a=np.asarray(im.convert('RGB')).astype(float)
    d=np.sqrt(((a-np.array(bg))**2).sum(-1))
    near=d<tol
    lab,_=ndimage.label(near)
    border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    bgmask=np.isin(lab,list(border))
    alpha=(~bgmask).astype(np.uint8)*255
    al=Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out=im.convert('RGBA'); out.putalpha(al); return out
L=Image.open('assets/ref/ref_pose_lineup.webp')
c=cut(L,(0,0,0),38)
al=np.asarray(c)[:,:,3]>40
names=['stand','stand34','wave_low','wave_high','step','jump','clasp','sit']
colsum=al.sum(0).astype(float)
guess=[205,375,560,765,945,1150,1335]
cuts=[0]+[g-40+int(np.argmin(colsum[g-40:g+40])) for g in guess]+[L.width]
print('cuts',cuts,[int(colsum[c]) for c in cuts[1:-1]])
for k in range(8):
    x0,x1=cuts[k],cuts[k+1]; ys=np.where(al[:,x0:x1].any(1))[0]; y0,y1=max(ys[0]-4,0),min(ys[-1]+5,L.height)
    s_=c.crop((x0,y0,x1,y1)); s_=s_.resize((s_.width*2,s_.height*2),Image.LANCZOS)
    s_.save(f'assets/char/pose_{names[k]}.png'); print(names[k],s_.size)
S=Image.open('assets/ref/ref_seated_closeup.webp')
h=S.crop((190,120,870,720)); hc=cut(h,tuple(np.asarray(S)[5,5]),45); hc.save('assets/char/head_closeup.png'); print('head',hc.size)
# keep only the main body (largest alpha component) in every cutout
import glob
for f in glob.glob('assets/char/*.png'):
    im=Image.open(f); a=np.asarray(im).copy(); m=a[:,:,3]>20
    lab,n=ndimage.label(ndimage.binary_dilation(m,iterations=3))
    if n>1:
        keep=1+int(np.argmax(ndimage.sum(m,lab,range(1,n+1)))); a[:,:,3]=a[:,:,3]*(lab==keep); Image.fromarray(a).save(f)
