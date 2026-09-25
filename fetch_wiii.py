import urllib.request
import json

overpass_url = "https://overpass-api.de/api/interpreter"
query = """[out:json][timeout:90];
(
  way["aeroway"~"runway|taxiway"](-6.155,106.630,-6.105,106.685);
  node["aeroway"~"holding_position|gate|parking_position"](-6.155,106.630,-6.105,106.685);
);
out body;
>;
out skel qt;
"""

proxy_handler = urllib.request.ProxyHandler({
    'http': 'socks5://127.0.0.1:40000',
    'https': 'socks5://127.0.0.1:40000'
})
opener = urllib.request.build_opener(proxy_handler)
req = urllib.request.Request(
    overpass_url,
    data=f"data={urllib.parse.quote(query)}".encode('utf-8'),
    headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
)
try:
    with opener.open(req, timeout=90) as resp:
        content = resp.read().decode('utf-8')
        data = json.loads(content)
        with open("/home/bmnrtkgto/project/atc-hub/wiii_osm_raw.json", "w") as f:
            json.dump(data, f)
        print(f"Downloaded {len(data.get('elements', []))} elements!")
except Exception as e:
    print(f"Error: {e}")
