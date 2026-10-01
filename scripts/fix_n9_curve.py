import json
import math

with open("wiii_data.json") as f:
    d = json.load(f)

# P_start: NP2 west end = [-6.122577, 106.639768]
# P_end: Runway 07L threshold = [-6.120986, 106.638883]
# We want a smooth, wide sweeping teardrop/U-turn curve wrapping around the western tip of the island.
# Tangent at P_start (NP2): heading west-southwest (~248°).
# Tangent at P_end (07L threshold): heading east-northeast (~068°) into runway centerline!
# To achieve this, the curve sweeps out to the southwest:
# Apex of the sweep: ~[-6.1228, 106.6386] to [-6.1222, 106.6380].

# Cubic Bezier curve:
# P0 = P_start = [-6.122577, 106.639768]
# P1 = P0 + direction along NP2 westbound:
# Vector westbound on NP2: (-0.0007, -0.0017)
# P1 = [-6.122577 - 0.00045, 106.639768 - 0.00110] = [-6.123027, 106.638668]

# P3 = P_end = [-6.120986, 106.638883]
# Vector entering runway 07L is towards (+0.000425, +0.001056).
# So vector approaching P3 from the curve is in the same direction (+lat, +lon):
# P2 = P3 - tangent entering runway:
# P2 = [-6.120986 - 0.00060, 106.638883 - 0.00120] = [-6.121586, 106.637683]

# Let us sample 15 smooth points along this cubic bezier:
p0 = [-6.122577, 106.639768]
p1 = [-6.122950, 106.638700]
p2 = [-6.121650, 106.637750]
p3 = [-6.120986, 106.638883]

curve_pts = []
n_pts = 15
for i in range(n_pts):
    t = i / (n_pts - 1)
    lat = (1-t)**3 * p0[0] + 3*(1-t)**2 * t * p1[0] + 3*(1-t) * t**2 * p2[0] + t**3 * p3[0]
    lon = (1-t)**3 * p0[1] + 3*(1-t)**2 * t * p1[1] + 3*(1-t) * t**2 * p2[1] + t**3 * p3[1]
    curve_pts.append([round(lat, 6), round(lon, 6)])

# Check holding position HOLD N9 (25R/07L):
# On Jeppesen chart, HOLD N9 is on the curve southwest of the threshold, just before lining up onto the runway.
# In our sampled curve, let index 10 (~70% towards runway) be the holding point:
hp_pt = curve_pts[10]
print("New HOLD N9 position:", hp_pt)

# Update N9 taxiway:
for t in d["taxiways"]:
    if t.get("ref") == "N9":
        t["coords"] = curve_pts

# Update HOLD N9:
for hp in d.get("holding_positions", []):
    if "N9" in hp.get("name", ""):
        hp["lat"] = hp_pt[0]
        hp["lon"] = hp_pt[1]

# Update N9 label: position slightly outside the curve (southwest)
for l in d.get("taxiway_labels", []):
    if l.get("ref") == "N9":
        l["lat"] = curve_pts[6][0]
        l["lon"] = curve_pts[6][1]

# Update runway mechanism for 07L holding_point:
if "07L" in d.get("runway_mechanisms", {}):
    d["runway_mechanisms"]["07L"]["holding_point"]["lat"] = hp_pt[0]
    d["runway_mechanisms"]["07L"]["holding_point"]["lon"] = hp_pt[1]

with open("wiii_data.json", "w") as f:
    json.dump(d, f, indent=2)

print("Generated smooth sweeping teardrop curve for N9 (15 points) successfully!")
