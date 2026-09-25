import xml.etree.ElementTree as ET
import json

print("Extracting full vector data for WIII from OSM XML...")
tree = ET.parse('/home/bmnrtkgto/project/atc-hub/wiii_osm.xml')
root = tree.getroot()

nodes = {}
for node in root.findall('node'):
    nid = node.get('id')
    lat_str = node.get('lat')
    lon_str = node.get('lon')
    if nid and lat_str and lon_str:
        nodes[nid] = (round(float(lat_str), 6), round(float(lon_str), 6))

runways = []
taxiways = []
aprons = []
parking_stands = []
terminals = []

for way in root.findall('way'):
    wid = way.get('id')
    tags = {t.get('k'): t.get('v') for t in way.findall('tag') if t.get('k')}
    aero = tags.get('aeroway')
    building = tags.get('building')
    nd_refs = [nd.get('ref') for nd in way.findall('nd') if nd.get('ref')]
    coords = [nodes[ref] for ref in nd_refs if ref in nodes]
    if not coords:
        continue

    if aero == 'runway':
        runways.append({
            'id': wid,
            'ref': tags.get('ref', 'RWY'),
            'width': float(tags.get('width', 60)),
            'length': tags.get('length', '3600'),
            'surface': tags.get('surface', 'asphalt'),
            'coords': coords
        })
    elif aero == 'taxiway':
        taxiways.append({
            'id': wid,
            'ref': tags.get('ref') or tags.get('name') or '',
            'width': float(tags.get('width', 23)),
            'coords': coords
        })
    elif aero == 'apron':
        aprons.append({
            'id': wid,
            'ref': tags.get('ref') or tags.get('name') or 'Apron',
            'coords': coords
        })
    elif aero == 'parking_position':
        cen_lat = round(sum(c[0] for c in coords) / len(coords), 6)
        cen_lon = round(sum(c[1] for c in coords) / len(coords), 6)
        parking_stands.append({
            'id': wid,
            'ref': tags.get('ref') or tags.get('name') or '',
            'coords': coords,
            'lat': cen_lat,
            'lon': cen_lon
        })
    elif aero == 'terminal' or building in ('terminal', 'hangar', 'yes'):
        terminals.append({
            'id': wid,
            'ref': tags.get('name') or tags.get('ref') or 'Building',
            'coords': coords
        })

gates = []
holding_positions = []
for node in root.findall('node'):
    nid = node.get('id')
    tags = {t.get('k'): t.get('v') for t in node.findall('tag') if t.get('k')}
    aero = tags.get('aeroway')
    if nid not in nodes:
        continue
    lat, lon = nodes[nid]
    if aero == 'gate':
        gates.append({
            'id': nid,
            'ref': tags.get('ref') or tags.get('name') or 'G',
            'lat': lat,
            'lon': lon
        })
    elif aero == 'holding_position':
        holding_positions.append({
            'id': nid,
            'ref': tags.get('ref') or 'HP',
            'lat': lat,
            'lon': lon
        })

print(f"Extraction summary:")
print(f"  Runways: {len(runways)}")
print(f"  Taxiways: {len(taxiways)}")
print(f"  Aprons: {len(aprons)}")
print(f"  Parking Stands: {len(parking_stands)}")
print(f"  Gates: {len(gates)}")
print(f"  Holding Positions: {len(holding_positions)}")
print(f"  Terminals: {len(terminals)}")

wiii_data = {
    'icao': 'WIII',
    'iata': 'CGK',
    'name': 'Soekarno-Hatta International Airport',
    'center': {'lat': -6.12557, 'lon': 106.655998},
    'runways': runways,
    'taxiways': taxiways,
    'aprons': aprons,
    'parking_stands': parking_stands,
    'gates': gates,
    'holding_positions': holding_positions,
    'terminals': terminals,
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

print("Saved complete WIII vector data to /home/bmnrtkgto/project/atc-hub/wiii_data.json successfully!")
