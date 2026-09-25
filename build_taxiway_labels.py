import json

with open('/home/bmnrtkgto/project/atc-hub/wiii_data.json') as f:
    d = json.load(f)

tws = d.get('taxiways', [])
by_ref = {}
for tw in tws:
    ref = tw.get('ref')
    if ref:
        if ref not in by_ref:
            by_ref[ref] = []
        by_ref[ref].append(tw['coords'])

labels = []
for ref, ways in by_ref.items():
    # collect all coords
    all_pts = [pt for w in ways for pt in w]
    avg_lat = sum(p[0] for p in all_pts) / len(all_pts)
    avg_lon = sum(p[1] for p in all_pts) / len(all_pts)
    labels.append({'ref': ref, 'lat': avg_lat, 'lon': avg_lon, 'count': len(ways)})

d['taxiway_labels'] = labels
with open('/home/bmnrtkgto/project/atc-hub/wiii_data.json', 'w') as f:
    json.dump(d, f, indent=2)

print(f"Computed {len(labels)} persistent taxiway labels in wiii_data.json")
