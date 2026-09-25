import xml.etree.ElementTree as ET
import json

print("Parsing XML...")
tree = ET.parse('/home/bmnrtkgto/project/atc-hub/wiii_osm.xml')
root = tree.getroot()

nodes = {}
for node in root.findall('node'):
    nid = node.get('id')
    lat_str = node.get('lat')
    lon_str = node.get('lon')
    if nid and lat_str and lon_str:
        lat = float(lat_str)
        lon = float(lon_str)
        tags = {tag.get('k'): tag.get('v') for tag in node.findall('tag') if tag.get('k')}
        nodes[nid] = {'lat': lat, 'lon': lon, 'tags': tags}

runways = []
taxiways = []
aprons = []
holding_positions = []
parking_positions = []

for way in root.findall('way'):
    wid = way.get('id')
    tags = {tag.get('k'): tag.get('v') for tag in way.findall('tag') if tag.get('k')}
    nd_refs = [nd.get('ref') for nd in way.findall('nd') if nd.get('ref')]
    coords = []
    for ref in nd_refs:
        if ref in nodes:
            coords.append([nodes[ref]['lat'], nodes[ref]['lon']])
            
    aeroway = tags.get('aeroway')
    if aeroway == 'runway':
        runways.append({
            'id': wid,
            'ref': tags.get('ref', 'RWY'),
            'width': tags.get('width', 45),
            'surface': tags.get('surface', 'asphalt'),
            'coords': coords
        })
    elif aeroway == 'taxiway':
        taxiways.append({
            'id': wid,
            'ref': tags.get('ref', tags.get('name', 'TWY')),
            'width': tags.get('width', 23),
            'coords': coords
        })
    elif aeroway == 'apron':
        aprons.append({
            'id': wid,
            'ref': tags.get('ref', tags.get('name', 'Apron')),
            'coords': coords
        })

for nid, n in nodes.items():
    aero = n['tags'].get('aeroway')
    if aero == 'holding_position':
        holding_positions.append({
            'id': nid,
            'ref': n['tags'].get('ref', 'HP'),
            'lat': n['lat'],
            'lon': n['lon']
        })
    elif aero in ('parking_position', 'gate'):
        parking_positions.append({
            'id': nid,
            'ref': n['tags'].get('ref', n['tags'].get('name', 'GATE')),
            'lat': n['lat'],
            'lon': n['lon'],
            'type': aero
        })

print(f"Parsed: {len(runways)} runways, {len(taxiways)} taxiways, {len(aprons)} aprons, {len(holding_positions)} holding positions, {len(parking_positions)} parking positions/gates")

wiii_data = {
    'icao': 'WIII',
    'iata': 'CGK',
    'name': 'Soekarno-Hatta International Airport',
    'center': {'lat': -6.12557, 'lon': 106.655998},
    'runways': runways,
    'taxiways': taxiways,
    'aprons': aprons,
    'holding_positions': holding_positions,
    'parking_positions': parking_positions,
    'navaids': [
        {'id': 'CKG', 'name': 'CENGKARENG VOR-DME', 'freq': '115.6', 'lat': -6.1275, 'lon': 106.658},
        {'id': 'DKI', 'name': 'JAKARTA VOR-DME', 'freq': '114.7', 'lat': -6.115, 'lon': 106.960},
        {'id': 'BTO', 'name': 'BUDIARTO VOR', 'freq': '113.8', 'lat': -6.295, 'lon': 106.565},
        {'id': 'HLM', 'name': 'HALIM VOR', 'freq': '116.4', 'lat': -6.266, 'lon': 106.890}
    ],
    'waypoints': [
        {'id': 'DOLTA', 'lat': -6.345, 'lon': 106.720, 'desc': 'South-East STAR/SID'},
        {'id': 'BUNTO', 'lat': -6.120, 'lon': 106.950, 'desc': 'East STAR/SID'},
        {'id': 'KRAKE', 'lat': -6.020, 'lon': 106.280, 'desc': 'West STAR/SID'},
        {'id': 'RAKIT', 'lat': -6.250, 'lon': 106.400, 'desc': 'South-West IAF'},
        {'id': 'GOMBA', 'lat': -5.920, 'lon': 106.750, 'desc': 'North Approach'}
    ]
}

with open('/home/bmnrtkgto/project/atc-hub/wiii_data.json', 'w') as f:
    json.dump(wiii_data, f, indent=2)

print("Saved to wiii_data.json successfully!")
