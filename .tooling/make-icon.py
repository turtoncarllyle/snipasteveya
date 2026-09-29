import struct,zlib,os
root=r'E:\github\Screenshot OCR(SnipasteVeya)\src-tauri\icons'
os.makedirs(root,exist_ok=True)
w=h=64
rows=[]
for y in range(h):
    row=bytearray([0])
    for x in range(w):
        r=int(70+75*x/w); g=int(105+45*y/h); b=225; a=255
        if (x-32)**2+(y-32)**2<24**2: r,g,b=104,152,250
        if 21<=x<=42 and 17<=y<=47: r,g,b=245,248,255
        if 29<=x<=34 and 22<=y<=42: r,g,b=104,152,250
        row.extend([r,g,b,a])
    rows.append(bytes(row))
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')
open(os.path.join(root,'icon.png'),'wb').write(png)
ico=struct.pack('<HHH',0,1,1)+struct.pack('<BBBBHHII',64,64,0,0,1,32,len(png),22)+png
open(os.path.join(root,'icon.ico'),'wb').write(ico)
