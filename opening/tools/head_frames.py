# Peek-head frames from the canonical seated close-up: open / half-lid / closed, plus look-left / look-right.
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
S=Image.open('assets/ref/ref_seated_closeup.webp').convert('RGB')
OX,OY=160,110; im=S.crop((OX,OY,920,800)); a=np.asarray(im).astype(float)
bg=np.asarray(S)[8,8].astype(float)
near=np.sqrt(((a-bg)**2).sum(-1))<55
lab,_=ndimage.label(near); border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
alpha=(~np.isin(lab,list(border))).astype(np.uint8)*255
alpha[600-OY:,815-OX:]=0            # drop the mug
alpha[720-OY:,:]=0                  # below the chin; hidden under the cover anyway
al=Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
base=im.convert('RGBA'); base.putalpha(al)
# largest component only
m=np.asarray(al)>20; lab,n=ndimage.label(m); k=1+int(np.argmax(ndimage.sum(m,lab,range(1,n+1))))
A=np.asarray(base).copy(); A[:,:,3]=A[:,:,3]*(lab==k); base=Image.fromarray(A)
base.save('assets/char/peek_open.png')
eyes=[(448-OX,510-OY),(668-OX,505-OY)]  # eye centers (original coords -> crop)
face=tuple(int(v) for v in np.asarray(im)[590-OY,520-OX].tolist())
print('eyes',eyes,'face',face)
def lids(f):
    out=base.copy(); d=ImageDraw.Draw(out); rx,ry=74,76
    for (cx,cy) in eyes:
        # clip lid to the eye-white ellipse area
        mask=Image.new('L',out.size,0); md=ImageDraw.Draw(mask); md.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill=255)
        lid=Image.new('L',out.size,0); ld=ImageDraw.Draw(lid); y=cy-ry+f*2*ry; ld.rectangle((cx-rx-5,cy-ry-5,cx+rx+5,y),fill=255)
        lm=Image.fromarray(np.minimum(np.asarray(mask),np.asarray(lid))).filter(ImageFilter.GaussianBlur(1.2))
        shade=Image.new('RGBA',out.size,face+(255,)); out=Image.composite(shade,out,lm)
        d=ImageDraw.Draw(out)
        if f>0.02: d.arc((cx-rx+6,y-18,cx+rx-6,y+14),200,340,fill=(28,32,22,255),width=6) if f<0.95 else d.arc((cx-rx+10,cy-28,cx+rx-10,cy+30),20,160,fill=(28,32,22,255),width=7)
    return out
lids(0.5).save('assets/char/peek_half.png'); lids(1.0).save('assets/char/peek_closed.png')
# shifted-gaze variants: move iris/pupil inside the eye whites
def look(dx):
    out=base.copy(); src=base.copy()
    for (cx,cy) in eyes:
        r=58; box=(cx-r,cy-r+4,cx+r,cy+r+4); iris=src.crop(box)
        m=Image.new('L',iris.size,0); ImageDraw.Draw(m).ellipse((2,2,2*r-2,2*r-2),fill=255)
        white=Image.new('RGBA',iris.size,(238,238,236,255)); wm=Image.new('L',iris.size,0); ImageDraw.Draw(wm).ellipse((0,0,2*r,2*r),fill=255)
        ew=Image.new('L',out.size,0); ImageDraw.Draw(ew).ellipse((cx-74,cy-76,cx+74,cy+76),fill=255)
        tmp=out.copy(); tmp.paste(white,box[:2],wm); out=Image.composite(tmp,out,ew)
        tmp=out.copy(); tmp.paste(iris,(box[0]+dx,box[1]),m); out=Image.composite(tmp,out,ew)
    return out
look(-15).save('assets/char/peek_left.png'); look(15).save('assets/char/peek_right.png')
W=base.width; sheet=Image.new('RGBA',(W*5,base.height),(255,255,255,255))
for i,f in enumerate(['open','half','closed','left','right']): sheet.alpha_composite(Image.open(f'assets/char/peek_{f}.png'),(i*W,0))
sheet.convert('RGB').resize((W*5//3,base.height//3)).save('../peek_check.jpg')
