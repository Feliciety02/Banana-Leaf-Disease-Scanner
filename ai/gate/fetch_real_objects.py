import sys, io, random, zipfile
from pathlib import Path
sys.path.insert(0, r'C:\dmd\gate')
import download_data as d
PLANT = {'leaf','house_plant','tree','bush','grass','flower','cactus','palm_tree','banana','mushroom','broccoli','asparagus','pineapple','strawberry','garden','garden_hose','potato','onion','carrot','peas','string_bean','grapes','pear','apple','blackberry','blueberry','watermelon'}
out = Path(r'C:\dmd\gate\raw\negative\domainnet_real_objects')
archive = zipfile.ZipFile(io.BufferedReader(d.HttpRangeFile(d.DOMAINNET['real']), buffer_size=1 << 20))
infos = [i for i in archive.infolist() if i.filename.count('/') >= 2 and i.filename.lower().endswith(d.IMAGE_EXT) and i.filename.split('/')[-2] not in PLANT]
random.seed(7); pick = random.sample(infos, 3000)
for n, info in enumerate(pick):
    dest = out / info.filename.split('/')[-2] / Path(info.filename).name
    dest.parent.mkdir(parents=True, exist_ok=True)
    with archive.open(info) as src, open(dest, 'wb') as dst: dst.write(src.read())
    if n % 500 == 0: print('objects', n, flush=True)
print('domainnet real objects ready', flush=True)
