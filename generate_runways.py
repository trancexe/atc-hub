import xml.etree.ElementTree as ET
import heapq
import json
import math

tree = ET.parse('/home/bmnrtkgto/project/atc-hub/wiii_osm.xml')
root = tree.getroot()
nodes = {n.attrib['id']: (float(n.attrib['lat']), float(n.attrib['lon'])) for n in root.findall('node')}

# Build comprehensive taxiway & runway network graph
graph = {}
taxiways = []
runways = {}

for way in root.findall('way'):
    tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
    refs = [nd.attrib['ref'] for nd in way.findall('nd')]
    
    if tags.get('aeroway') == 'runway':
        ref = tags.get('ref')
        runways[ref] = {
            'id': way.attrib['id'],
            'refs': refs,
            'coords': [nodes[r] for r in refs]
        }
        for i in range(len(refs) - 1):
            u, v = refs[i], refs[i+1]
            if u in nodes and v in nodes:
                p1, p2 = nodes[u], nodes[v]
                d = math.hypot(p1[0]-p2[0], p1[1]-p2[1])
                graph.setdefault(u, []).append((v, d))
                graph.setdefault(v, []).append((u, d))

    elif tags.get('aeroway') in ['taxiway', 'taxilane']:
        taxiways.append((way.attrib['id'], tags.get('ref', ''), refs))
        for i in range(len(refs) - 1):
            u, v = refs[i], refs[i+1]
            if u in nodes and v in nodes:
                p1, p2 = nodes[u], nodes[v]
                d = math.hypot(p1[0]-p2[0], p1[1]-p2[1])
                graph.setdefault(u, []).append((v, d))
                graph.setdefault(v, []).append((u, d))

def dijkstra_path(start, target):
    dist = {start: 0}
    prev = {}
    pq = [(0, start)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == target:
            break
        if d > dist.get(u, float('inf')):
            continue
        for v, weight in graph.get(u, []):
            nd = d + weight
            if nd < dist.get(v, float('inf')):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    if target not in prev and target != start:
        return None
    path = []
    curr = target
    while curr:
        path.append(curr)
        curr = prev.get(curr)
    path.reverse()
    return path

# 6 Runway directions in WIII:
runway_configs = {
    '25R': {
        'runway_ref': '07L/25R',
        'threshold_node': '309102919',
        'opposite_threshold_node': '309102917',
        'hp_node': '13204190222', # HP N2
        'hp_name': 'N2',
        'heading': 250,
        'entry_nodes': ['13204190222', '6996768001', '10264898458', '6996767994', '8359696503', '6996767993', '6996767992', '8359696502', '6996767991', '6996767990', '6996768002', '6996767989', '309102919']
    },
    '07L': {
        'runway_ref': '07L/25R',
        'threshold_node': '309102917',
        'opposite_threshold_node': '309102919',
        'hp_node': '10267041859', # HP N8
        'hp_name': 'N8',
        'heading': 70,
        'entry_nodes': None
    },
    '25L': {
        'runway_ref': '07R/25L',
        'threshold_node': '309104361',
        'opposite_threshold_node': '309104360',
        'hp_node': '8359463793', # HP S2
        'hp_name': 'S2',
        'heading': 250,
        'entry_nodes': None
    },
    '07R': {
        'runway_ref': '07R/25L',
        'threshold_node': '309104360',
        'opposite_threshold_node': '309104361',
        'hp_node': '309104467', # HP S8
        'hp_name': 'S8',
        'heading': 70,
        'entry_nodes': None
    },
    '24': {
        'runway_ref': '06/24',
        'threshold_node': '6375203153',
        'opposite_threshold_node': '6795879009',
        'hp_node': '13204190223', # HP M1
        'hp_name': 'M1',
        'heading': 240,
        'entry_nodes': None
    },
    '06': {
        'runway_ref': '06/24',
        'threshold_node': '6795879009',
        'opposite_threshold_node': '6375203153',
        'hp_node': '8359682688', # HP M8
        'hp_name': 'M8',
        'heading': 60,
        'entry_nodes': None
    }
}

compiled_runways = {}

for rwy_dir, cfg in runway_configs.items():
    rw_info = runways[cfg['runway_ref']]
    refs = rw_info['refs']
    
    if cfg['entry_nodes']:
        lineup_path = [nodes[n] for n in cfg['entry_nodes']]
    else:
        path = dijkstra_path(cfg['hp_node'], cfg['threshold_node'])
        if path:
            lineup_path = [nodes[n] for n in path]
        else:
            lineup_path = [nodes[cfg['hp_node']], nodes[cfg['threshold_node']]]

    t_idx = refs.index(cfg['threshold_node'])
    o_idx = refs.index(cfg['opposite_threshold_node'])
    if t_idx < o_idx:
        roll_nodes = refs[t_idx:o_idx+1]
    else:
        roll_nodes = refs[t_idx:o_idx-1:-1] if o_idx > 0 else refs[t_idx::-1]
    
    roll_coords = [nodes[n] for n in roll_nodes]
    hp_coord = nodes[cfg['hp_node']]
    
    compiled_runways[rwy_dir] = {
        'name': f"Runway {rwy_dir}",
        'heading': cfg['heading'],
        'holding_point': {
            'node_id': cfg['hp_node'],
            'name': cfg['hp_name'],
            'lat': hp_coord[0],
            'lon': hp_coord[1]
        },
        'threshold': {
            'node_id': cfg['threshold_node'],
            'lat': nodes[cfg['threshold_node']][0],
            'lon': nodes[cfg['threshold_node']][1]
        },
        'lineup_path': lineup_path,
        'takeoff_roll_path': roll_coords
    }
    print(f"Generated Runway {rwy_dir}: Lineup nodes={len(lineup_path)}, Roll nodes={len(roll_coords)}")

with open('/home/bmnrtkgto/project/atc-hub/wiii_data.json') as f:
    d = json.load(f)

d['runway_mechanisms'] = compiled_runways

with open('/home/bmnrtkgto/project/atc-hub/wiii_data.json', 'w') as f:
    json.dump(d, f, indent=2)

print("Successfully written runway_mechanisms to wiii_data.json!")
