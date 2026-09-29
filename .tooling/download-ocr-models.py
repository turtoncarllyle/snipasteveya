import urllib.request, pathlib, hashlib
root=pathlib.Path(__file__).resolve().parents[1] / 'src-tauri' / 'resources' / 'ocr'
root.mkdir(parents=True, exist_ok=True)
files={
'pp-ocrv5_mobile_det.onnx':'1eb7b4f7ab657ebd1c66d5f79bca7497f29768a2e3c15e52daecbba1a8e4a039',
'pp-ocrv5_mobile_rec.onnx':'243a0f06d826761323e9045e9b113ab2c191c3aa50565585e628300b8eda0224',
'ppocrv5_dict.txt':'d1979e9f794c464c0d2e0b70a7fe14dd978e9dc644c0e71f14158cdf8342af1b',
}
for name,digest in files.items():
    target=root/name
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==digest:
        print(name,'already valid'); continue
    url='https://www.modelscope.cn/api/v1/models/greatv/oar-ocr/repo?Revision=master&FilePath='+name
    print('download',name,url)
    urllib.request.urlretrieve(url,target)
    got=hashlib.sha256(target.read_bytes()).hexdigest()
    print(name,target.stat().st_size,got)
    if got!=digest: raise SystemExit('hash mismatch '+name)
