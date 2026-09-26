"""
Generate precomputed taxiway network graph and gate-to-holding-point routes
for all runways in WIII.
"""
import xml.etree.ElementTree as ET
import collections
import heapq
import json
import math

def build_taxiway_graph():
    print("Parsing wiii_osm.xml...")
    tree = ET.parse('/home/bmnrtkgto/project/atc-hub/wiii_osm.xml')
    root = tree.getroot()

    nodes = {}
    for n in root.findall('node'):
        nid = n.get('id')
        lat = float(n.get('lat'))
        lon = float(n.get('lon'))
        nodes[nid] = (lat, lon)

    adj = collections.defaultdict(dict)
    way_tags = {}
    for w in root.findall('way'):
        tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
        aeroway = tags.get('aeroway')
        ref = tags.get('ref') or tags.get('name') or ''
        if aeroway in ['taxiway', 'taxilane']:
            nds = [nd.get('ref') for nd in w.findall('nd') if nd.get('ref') in nodes]
            for i in range(len(nds) - 1):
                u, v = nds[i], nds[i+1]
                p1, p2 = nodes[u], nodes[v]
                dist = math.hypot(p1[0]-p2[0], p1[1]-p2[1]) * 111000
                adj[u][v] = min(adj[u].get(v, dist), dist)
                adj[v][u] = min(adj[v].get(u, dist), dist)

    with open('/home/bmnrtkgto/project/atc-hub/wiii_data.json') as f:
        data = json.load(f)

    mechanisms = data.get('runway_mechanisms', {})
    
    # Starting node at Taxiway NC6 (Push release of Gate E1)
    start_lat, start_lon = -6.121013, 106.650012
    # Find nearest graph node to start_lat, start_lon
    start_node = min(adj.keys(), key=lambda nid: math.hypot(nodes[nid][0]-start_lat, nodes[nid][1]-start_lon))
    print(f"Start node for Gate E1 release: {start_node} at {nodes[start_node]}")

    def dijkstra(start, target):
        dist = {start: 0.0}
        prev = {}
        pq = [(0.0, start)]
        visited = set()

        while pq:
            d, u = heapq.heappop(pq)
            if u == target:
                break
            if u in visited:
                continue
            visited.add(u)

            for v, weight in adj[u].items():
                if d + weight < dist.get(v, float('inf')):
                    dist[v] = d + weight
                    prev[v] = u
                    heapq.heappush(pq, (dist[v], v))

        if target not in dist:
            return None

        curr = target
        path = []
        while curr:
            path.append(curr)
            curr = prev.get(curr)
        path.reverse()
        return path

    taxi_routes = {}
    for rwy, mech in mechanisms.items():
        hp = mech.get('holding_point', {})
        hp_node = hp.get('node_id')
        if not hp_node or hp_node not in adj:
            # find closest node
            target_lat, target_lon = hp.get('lat'), hp.get('lon')
            hp_node = min(adj.keys(), key=lambda nid: math.hypot(nodes[nid][0]-target_lat, nodes[nid][1]-target_lon))

        path_nodes = dijkstra(start_node, hp_node)
        if path_nodes:
            coords = [list(nodes[nid]) for nid in path_nodes]
            taxi_routes[rwy] = {
                'holding_point': hp.get('name'),
                'target_node': hp_node,
                'points_count': len(coords),
                'coords': coords
            }
            print(f"Route to Runway {rwy} ({hp.get('name')}): {len(coords)} nodes")
        else:
            print(f"FAILED to find route to Runway {rwy}")

    data['taxi_routes_by_runway'] = taxi_routes
    with open('/home/bmnrtkgto/project/atc-hub/wiii_data.json', 'w') as f:
        json.dump(data, f, indent=2)

    print("Successfully updated wiii_data.json with taxi_routes_by_runway!")

if __name__ == '__main__':
    build_taxiway_graph()
