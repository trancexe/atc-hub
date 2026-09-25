import urllib.request
import json

# Overpass API query for Soekarno Hatta WIII
overpass_url = "http://overpass-api.de/api/interpreter"
query = """
[out:json][timeout:60];
(
  way["aeroway"~"runway|taxiway"](-6.155,106.630,-6.105,106.685);
  node["aeroway"~"holding_position|gate|parking_position"](-6.155,106.630,-6.105,106.685);
);
out body;
>;
out skel qt;
"""

print("Fetching OSM data for WIII...")
req = urllib.request.Request(
    overpass_url, 
    data=query.encode('utf-8'),
    headers={'User-Agent': 'ATC-Hub-Extractor/1.0'}
)
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        with open("/home/bmnrtkgto/project/atc-hub/wiii_osm_raw.json", "w") as f:
            json.dump(data, f)
        print(f"Success! Elements: {len(data.get('elements', []))}")
except Exception as e:
    print(f"Error fetching from Overpass: {e}")
