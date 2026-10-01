import json
import math

def generate_arc(p1, p2, p_corner, n_pts=11):
    # Quadratic bezier curve between p1 and p2 with control point p_corner
    pts = []
    for i in range(n_pts):
        t = i / (n_pts - 1)
        lat = (1-t)**2 * p1[0] + 2*(1-t)*t * p_corner[0] + t**2 * p2[0]
        lon = (1-t)**2 * p1[1] + 2*(1-t)*t * p_corner[1] + t**2 * p2[1]
        pts.append([round(lat, 6), round(lon, 6)])
    return pts

with open("wiii_data.json") as f:
    d = json.load(f)

# Intersection 1: N2 + NP2 + NC2 at P_INT1 = [-6.111048, 106.668679]
# Rays from P_INT1:
# East on NP2: towards [-6.110845, 106.669184]
# West on NP2: towards [-6.111382, 106.667839]
# North on N2: towards [-6.109950, 106.668480]
# South on NC2: towards P_INT2 = [-6.112102, 106.668470]

P_INT1 = [-6.111048, 106.668679]
P_INT2 = [-6.112102, 106.668470]

# Distance for tangent points along arms: ~40-45 meters (~0.00035 to 0.00040 degrees)
# 1. NP2 East tangent point:
np2_e = [-6.110885, 106.669080]
# 2. NP2 West tangent point:
np2_w = [-6.111215, 106.668260]
# 3. N2 North tangent point:
n2_n = [-6.110680, 106.668615]
# 4. NC2 South tangent point (between P_INT1 and P_INT2):
nc2_s1 = [-6.111420, 106.668610]

# Generate the 4 fillets for Intersection 1 (N2 + NP2 + NC2):
fillet_np2_n2_e = generate_arc(np2_e, n2_n, P_INT1)   # East NP2 to North N2
fillet_np2_n2_w = generate_arc(n2_n, np2_w, P_INT1)   # North N2 to West NP2
fillet_np2_nc2_e = generate_arc(nc2_s1, np2_e, P_INT1) # South NC2 to East NP2
fillet_np2_nc2_w = generate_arc(np2_w, nc2_s1, P_INT1) # West NP2 to South NC2

# Intersection 2: NC2 + NP1 at P_INT2 = [-6.112102, 106.668470]
# Rays from P_INT2:
# North on NC2: towards P_INT1 (tangent point: nc2_n2 = [-6.111750, 106.668530])
# South on NC2: towards [-6.113800, 106.669298] (tangent point: nc2_s2 = [-6.112450, 106.668630])
# East on NP1: towards [-6.111878, 106.669032] (tangent point: np1_e = [-6.111950, 106.668850])
# West on NP1: towards [-6.114051, 106.663587] (tangent point: np1_w = [-6.112260, 106.668070])

nc2_n2 = [-6.111750, 106.668530]
nc2_s2 = [-6.112450, 106.668630]
np1_e = [-6.111950, 106.668850]
np1_w = [-6.112260, 106.668070]

# Generate fillets for Intersection 2:
fillet_np1_nc2_ne = generate_arc(np1_e, nc2_n2, P_INT2)
fillet_np1_nc2_nw = generate_arc(nc2_n2, np1_w, P_INT2)
fillet_np1_nc2_se = generate_arc(nc2_s2, np1_e, P_INT2)
fillet_np1_nc2_sw = generate_arc(np1_w, nc2_s2, P_INT2)

# Add fillet taxiway ways into wiii_data.json
new_fillets = [
    {"id": 992001, "ref": "", "coords": fillet_np2_n2_e},
    {"id": 992002, "ref": "", "coords": fillet_np2_n2_w},
    {"id": 992003, "ref": "", "coords": fillet_np2_nc2_e},
    {"id": 992004, "ref": "", "coords": fillet_np2_nc2_w},
    {"id": 992005, "ref": "", "coords": fillet_np1_nc2_ne},
    {"id": 992006, "ref": "", "coords": fillet_np1_nc2_nw},
    {"id": 992007, "ref": "", "coords": fillet_np1_nc2_se},
    {"id": 992008, "ref": "", "coords": fillet_np1_nc2_sw},
]

# Ensure tangent points exist in NP2, NP1, N2, NC2 so Dijkstra graphs and visual rendering connect seamlessly
# In NP2:
for t in d["taxiways"]:
    if t.get("ref") == "NP2":
        # Insert np2_e before P_INT1, and np2_w after P_INT1
        new_coords = []
        for p in t["coords"]:
            if p == P_INT1:
                new_coords.append(np2_e)
                new_coords.append(P_INT1)
                new_coords.append(np2_w)
            else:
                new_coords.append(p)
        t["coords"] = new_coords

# In NP1:
for t in d["taxiways"]:
    if t.get("ref") == "NP1":
        new_coords = []
        for p in t["coords"]:
            if p == P_INT2:
                new_coords.append(np1_e)
                new_coords.append(P_INT2)
                new_coords.append(np1_w)
            else:
                new_coords.append(p)
        t["coords"] = new_coords

# In N2:
for t in d["taxiways"]:
    if t.get("ref") == "N2":
        t["coords"] = [
            [-6.109270, 106.668258],
            [-6.109600, 106.668380],
            [-6.109950, 106.668480],
            [-6.110500, 106.668580],
            n2_n,
            P_INT1
        ]

# In NC2:
for t in d["taxiways"]:
    if t.get("ref") == "NC2":
        pts = t["coords"][:-2] # up to index 59
        pts.append(nc2_s2)
        pts.append(P_INT2)
        pts.append(nc2_n2)
        pts.append(nc2_s1)
        pts.append(P_INT1)
        t["coords"] = pts

# Append the new fillets:
d["taxiways"].extend(new_fillets)

with open("wiii_data.json", "w") as f:
    json.dump(d, f, indent=2)

print("Added all 8 turning fillets to N2/NC2 perempatan with NP1 & NP2 successfully!")
