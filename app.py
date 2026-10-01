import os
import os
import re
import json
import tempfile
import asyncio
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import edge_tts
import logging
from logging.handlers import RotatingFileHandler

BASE_DIR = Path(__file__).resolve().parent
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "atc_activity.log"

# Centralized ATC Activity & Telemetry Logger
logger = logging.getLogger("atc-hub")
logger.setLevel(logging.INFO)
log_formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')

file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3)
file_handler.setFormatter(log_formatter)
if not logger.handlers:
    logger.addHandler(file_handler)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(log_formatter)
    logger.addHandler(console_handler)

# Initialize Faster-Whisper
whisper_model = None
try:
    from faster_whisper import WhisperModel
    print("Loading Faster-Whisper tiny.en on CPU (int8)...")
    whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
    print("Faster-Whisper loaded successfully!")
except Exception as e:
    print(f"Failed to load Faster-Whisper: {e}")

app = FastAPI(title="ATC Hub Simulator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_FILE = BASE_DIR / "wiii_data.json"

@app.get("/api/airport/wiii")
async def get_airport_data():
    if not DATA_FILE.exists():
        raise HTTPException(status_code=404, detail="Airport data not found")
    with open(DATA_FILE, "r") as f:
        return json.load(f)

# Aviation Training Lessons (Strict ICAO Standard Callsigns & Telephony)
LESSONS = [
    {
        "id": "del-1",
        "phase": "Delivery / IFR Clearance",
        "title": "IFR Clearance Departure",
        "aircraft": {
            "callsign": "GIA502",
            "telephony": "INDONESIA 502",
            "airline": "Garuda Indonesia",
            "type": "B738",
            "gate": "Gate E1"
        },
        "situation": "INDONESIA 502 at Stand Echo 1 reporting initial call: 'Jakarta Delivery, INDONESIA 502, Stand Echo 1, Information Bravo, POB 156, destination Surabaya via DOLTA 1C departure, request clearance.' Issue official IFR departure clearance.",
        "target_text": "Indonesia 502 cleared to Surabaya via DOLTA 1C departure, climb FL 140, squawk 4521",
        "phonetic_tips": "ICAO Telephony: 'INDONESIA five zero two, cleared to Surabaya via DOLTA one Charlie departure, climb flight level one four zero, squawk four five two one'",
        "keywords": ["indonesia", "502", "surabaya", "dolta", "140", "4521"],
        "pilot_readback": "Cleared Surabaya, DOLTA 1C, runway 25R, climb FL 140, squawk 4521, Indonesia 502."
    },
    {
        "id": "gnd-1",
        "phase": "Ground / Pushback & Taxi",
        "title": "Pushback & Engine Start",
        "aircraft": {
            "callsign": "GIA502",
            "telephony": "INDONESIA 502",
            "airline": "Garuda Indonesia",
            "type": "B738",
            "gate": "Gate E1"
        },
        "situation": "Aircraft is ready for pushback and engine start at Terminal 3 ramp, facing West.",
        "target_text": "Indonesia 502 push and start approved, facing west",
        "phonetic_tips": "ICAO Telephony: 'INDONESIA five zero two, push and start approved, facing west'",
        "keywords": ["indonesia", "502", "push", "start", "approved", "west"],
        "pilot_readback": "Push and start approved, facing west, Indonesia 502."
    },
    {
        "id": "gnd-2",
        "phase": "Ground / Taxi to Holding Point",
        "title": "Taxi to Runway 25R via NC1",
        "aircraft": {
            "callsign": "GIA502",
            "telephony": "INDONESIA 502",
            "airline": "Garuda Indonesia",
            "type": "B738",
            "gate": "Apron T3"
        },
        "situation": "Aircraft completed pushback. Instruct aircraft to taxi to Runway 25R holding point via taxiways North Cross 1 and North 2.",
        "target_text": "Indonesia 502 taxi to holding point runway 25R via NC1, N2",
        "phonetic_tips": "ICAO Telephony: 'INDONESIA five zero two, taxi to holding point runway two five right via North Charlie one, November two'",
        "keywords": ["indonesia", "502", "taxi", "holding point", "25r", "nc1"],
        "pilot_readback": "Taxi holding point runway 25R via NC1, N2, Indonesia 502."
    },
    {
        "id": "twr-1",
        "phase": "Tower / Line Up & Takeoff",
        "title": "Line Up & Wait",
        "aircraft": {
            "callsign": "GIA502",
            "telephony": "INDONESIA 502",
            "airline": "Garuda Indonesia",
            "type": "B738",
            "gate": "Holding Point 25R"
        },
        "situation": "Preceding aircraft is on runway rollout. Instruct INDONESIA 502 to line up and wait Runway 25R.",
        "target_text": "Indonesia 502 line up and wait runway 25R",
        "phonetic_tips": "ICAO Telephony: 'INDONESIA five zero two, line up and wait runway two five right'",
        "keywords": ["indonesia", "502", "line up", "wait", "25r"],
        "pilot_readback": "Line up and wait, runway 25R, Indonesia 502."
    },
    {
        "id": "twr-2",
        "phase": "Tower / Takeoff Clearance",
        "title": "Cleared for Takeoff",
        "aircraft": {
            "callsign": "GIA502",
            "telephony": "INDONESIA 502",
            "airline": "Garuda Indonesia",
            "type": "B738",
            "gate": "Runway 25R"
        },
        "situation": "Runway is clear, wind 250 degrees at 8 knots. Issue takeoff clearance.",
        "target_text": "Indonesia 502 wind 250 at 8 knots, runway 25R cleared for takeoff",
        "phonetic_tips": "ICAO Telephony: 'INDONESIA five zero two, wind two five zero degrees eight knots, runway two five right cleared for takeoff'",
        "keywords": ["indonesia", "502", "wind", "cleared for takeoff", "25r"],
        "pilot_readback": "Cleared for takeoff runway 25R, Indonesia 502."
    },
    {
        "id": "app-1",
        "phase": "Approach / Inbound Vectoring",
        "title": "ILS Approach Clearance",
        "aircraft": {
            "callsign": "LNI650",
            "telephony": "LION INTER 650",
            "airline": "Lion Air",
            "type": "A333",
            "gate": "TMA Inbound"
        },
        "situation": "LION INTER 650 inbound via DOLTA 1A STAR. Issue ILS approach clearance Runway 25L and instruct descent to 3000 feet.",
        "target_text": "Lion Inter 650 descend to 3000 feet, cleared ILS runway 25L",
        "phonetic_tips": "ICAO Telephony: 'LION INTER six five zero, descend to three thousand feet, cleared ILS runway two five left'",
        "keywords": ["lion inter", "650", "descend", "3000", "cleared", "ils", "25l"],
        "pilot_readback": "Descend 3000 feet, cleared ILS runway 25L, Lion Inter 650."
    },
    {
        "id": "twr-3",
        "phase": "Tower / Final & Landing",
        "title": "Cleared to Land & Vacate",
        "aircraft": {
            "callsign": "LNI650",
            "telephony": "LION INTER 650",
            "airline": "Lion Air",
            "type": "A333",
            "gate": "Final Approach"
        },
        "situation": "LION INTER 650 on 3-mile final. Clear to land Runway 25L, wind calm.",
        "target_text": "Lion Inter 650 runway 25L cleared to land, wind 250 at 6",
        "phonetic_tips": "ICAO Telephony: 'LION INTER six five zero, runway two five left cleared to land, wind two five zero degrees six knots'",
        "keywords": ["lion inter", "650", "cleared to land", "25l"],
        "pilot_readback": "Cleared to land runway 25L, Lion Inter 650."
    },
    {
        "id": "app-2",
        "phase": "Approach / Holding Pattern",
        "title": "Enter Holding at TEGID",
        "aircraft": {
            "callsign": "LNI650",
            "telephony": "LION INTER 650",
            "airline": "Lion Air",
            "type": "A333",
            "gate": "TMA Holding"
        },
        "situation": "Heavy inbound congestion. Instruct LION INTER 650 to enter holding pattern over TEGID fix and maintain FL100.",
        "target_text": "Lion Inter 650 hold over TEGID, maintain FL 100",
        "phonetic_tips": "ICAO Telephony: 'LION INTER six five zero, hold over Tango Echo Golf India Delta, maintain flight level one zero zero'",
        "keywords": ["lion inter", "650", "hold", "tegid", "100"],
        "pilot_readback": "Hold at TEGID, inbound track 250 degrees, right hand pattern, maintain FL 100, Lion Inter 650."
    },
    {
        "id": "emg-1",
        "phase": "Emergency / Missed Approach",
        "title": "Go-Around / Missed Approach",
        "aircraft": {
            "callsign": "LNI650",
            "telephony": "LION INTER 650",
            "airline": "Lion Air",
            "type": "A333",
            "gate": "Short Final RWY 25L"
        },
        "situation": "Runway occupied by inspection vehicle on short final. Immediately abort landing!",
        "target_text": "Lion Inter 650 go around, climb to 3000 feet",
        "phonetic_tips": "ICAO Telephony: 'LION INTER six five zero, go around, climb to three thousand feet'",
        "keywords": ["lion inter", "650", "go around", "climb", "3000"],
        "pilot_readback": "Going around, climb to 3000 feet, Lion Inter 650."
    }
]

@app.get("/api/academy/lessons")
async def get_lessons():
    return LESSONS

@app.get("/api/audio/tts")
async def generate_pilot_voice(text: str = Query(..., min_length=1), voice: str = "en-US-GuyNeural"):
    """
    Generate natural pilot radio speech via edge-tts.
    Enforces strict ICAO Doc 4444 phonetic digit expansion:
    Numbers are spoken digit-by-digit (e.g. 502 -> 'five zero two', never 'five o two').
    """
    try:
        # Strict ICAO digit mapping
        digit_phonetics = {
            '0': 'zero',
            '1': 'one',
            '2': 'two',
            '3': 'three',
            '4': 'four',
            '5': 'five',
            '6': 'six',
            '7': 'seven',
            '8': 'eight',
            '9': 'nine'
        }
        
        # Expand any standalone digits or sequence of digits into explicit spaced phonetic words
        # e.g., '502' -> 'five zero two', '25R' -> 'two five Right', '119.75' -> 'one one nine decimal seven five'
        import re
        def expand_numbers_to_icao(match):
            val = match.group(0)
            return " " + " ".join(digit_phonetics[d] for d in val) + " "

        processed_text = re.sub(r'\d+', expand_numbers_to_icao, text)
        # Normalize double spaces and common aviation phonetic conventions
        processed_text = re.sub(r'\s+', ' ', processed_text).strip()

        communicate = edge_tts.Communicate(processed_text, voice)
        mp3_bytes = bytearray()
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio" and "data" in chunk:
                mp3_bytes.extend(chunk["data"]) # type: ignore
        return Response(content=bytes(mp3_bytes), media_type="audio/mpeg")
    except Exception as e:
        print(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stt/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    target_text: str = Form(None)
):
    try:
        content = await file.read()
        suffix = Path(file.filename).suffix if file.filename else ".wav"
        if not suffix:
            suffix = ".wav"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        initial_prompt = (
            "INDONESIA, LION INTER, SUPERGREEN, BATIK, WAGON AIR, SRIWIJAYA, "
            "one, two, tree, four, fife, six, seven, eight, niner, zero, "
            "runway 25R, 07L, 25L, 07R, 06, 24, taxiway NC1, NC2, NC3, N1, N2, NP1, "
            "push and start approved, taxi to holding point, cleared for takeoff, "
            "climb and maintain flight level, descend, cleared ILS approach, cleared to land, "
            "line up and wait, squawk, QNH, DOLTA, BUNTO, KRAKE, CKG, DKI"
        )

        transcript = ""
        duration = 0.0

        if whisper_model:
            segments, info = whisper_model.transcribe(
                tmp_path,
                beam_size=3,
                language="en",
                initial_prompt=initial_prompt,
                vad_filter=True
            )
            transcript = " ".join([seg.text.strip() for seg in segments])
            duration = round(info.duration, 2)
        else:
            transcript = "Speech model unavailable."

        # Remove temp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

        parsed = sanitize_and_normalize(transcript)
        score = calculate_score(transcript, target_text) if target_text else 100

        logger.info(f"[VOICE IN] dur={duration}s | raw='{transcript.strip()}' | norm='{parsed['normalized']}' | callsign={parsed['callsign']} | rwy={parsed['runway']} | intent={parsed['intent']}")

        return JSONResponse({
            "success": True,
            "text": transcript.strip(),
            "normalized": parsed["normalized"],
            "parsed": parsed,
            "duration": duration,
            "score": score
        })

    except Exception as e:
        print(f"Transcribe error: {e}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

# Normalizer dictionary: spoken / phonetic numbers & common speech artifacts
NUMBER_WORDS = {
    "zero": "0", "one": "1", "won": "1", "two": "2", "to": "2", "too": "2",
    "three": "3", "tree": "3", "four": "4", "fower": "4", "for": "4",
    "five": "5", "fife": "5", "six": "6", "seven": "7", "eight": "8", "ate": "8",
    "nine": "9", "niner": "9"
}

PHONETIC_ALPHABET = {
    "alpha": "A", "alfa": "A", "bravo": "B", "charlie": "C", "delta": "D",
    "echo": "E", "foxtrot": "F", "golf": "G", "hotel": "H", "india": "I",
    "juliett": "J", "juliet": "J", "kilo": "K", "lima": "L", "mike": "M",
    "november": "N", "oscar": "O", "papa": "P", "quebec": "Q", "romeo": "R",
    "sierra": "S", "tango": "T", "uniform": "U", "victor": "V", "whiskey": "W",
    "x-ray": "X", "xray": "X", "yankee": "Y", "zulu": "Z"
}

AVIATION_SYNONYMS = {
    "the send": "descend",
    "the sand": "descend",
    "disend": "descend",
    "claim": "climb",
    "flight level": "fl",
    "run way": "runway",
    "one way": "runway",
    "ran way": "runway",
    "lineup": "line up",
    "take off": "takeoff",
    "clear to land": "cleared to land",
    "clear for takeoff": "cleared for takeoff",
    "push back": "pushback",
    "north cross": "nc",
    "north charlie": "nc",
    "south charlie": "sc"
}

def sanitize_and_normalize(raw_text: str) -> dict:
    """
    Sanitize and parse voice input into standardized aviation tokens.
    Returns cleaned transcript, normalized token stream, and matched intents.
    """
    if not raw_text:
        return {"clean": "", "normalized": "", "callsign": None, "intent": None, "runway": None}

    cleaned = re.sub(r'[^\w\s]', ' ', raw_text.lower())
    for phrase, rep in AVIATION_SYNONYMS.items():
        cleaned = re.sub(rf'\b{phrase}\b', rep, cleaned)

    tokens = cleaned.split()
    norm_tokens = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok in NUMBER_WORDS:
            # Check sequential digits
            digit_seq = [NUMBER_WORDS[tok]]
            j = i + 1
            while j < len(tokens) and tokens[j] in NUMBER_WORDS:
                digit_seq.append(NUMBER_WORDS[tokens[j]])
                j += 1
            norm_tokens.append("".join(digit_seq))
            i = j
            continue
        elif tok in PHONETIC_ALPHABET:
            norm_tokens.append(PHONETIC_ALPHABET[tok])
        else:
            norm_tokens.append(tok)
        i += 1

    normalized_str = " ".join(norm_tokens)

    # Detect Runway (e.g. 25R, 25 left, 07L, 06, 24)
    rwy_match = re.search(r'\b(?:runway\s+)?(0[67]|2[45]|\d{2})\s*(left|right|center|l|r|c)?\b', normalized_str, re.I)
    runway = None
    if rwy_match:
        rwy_num = rwy_match.group(1).upper()
        rwy_side = (rwy_match.group(2) or "").upper()
        if rwy_side:
            rwy_side = "L" if "L" in rwy_side else ("R" if "R" in rwy_side else ("C" if "C" in rwy_side else ""))
        rwy_candidate = f"{rwy_num}{rwy_side}"
        if rwy_candidate in ["25L", "25R", "07L", "07R", "24", "06"]:
            runway = rwy_candidate

    # Detect Callsign with Full ICAO Telephony Mapping
    # GIA -> INDONESIA, LNI -> LION INTER, CTV -> SUPERGREEN, BTK -> BATIK, AWQ -> WAGON AIR
    callsign = None
    airline_telephony_map = {
        "indonesia": "GIA",
        "garuda": "GIA",
        "lion inter": "LNI",
        "lion": "LNI",
        "supergreen": "CTV",
        "citilink": "CTV",
        "batik": "BTK",
        "wagon air": "AWQ",
        "airasia": "AWQ",
        "sriwijaya": "SJY"
    }

    pattern = r'\b(indonesia|garuda|lion\s+inter|lion|supergreen|citilink|batik|wagon\s+air|airasia|sriwijaya)\s*(\d{1,4})?\b'
    airline_match = re.search(pattern, normalized_str, re.I)
    if airline_match:
        raw_telephony = re.sub(r'\s+', ' ', airline_match.group(1).lower())
        num = airline_match.group(2) or ""
        icao_code = airline_telephony_map.get(raw_telephony, "UNK")
        telephony_formal = {
            "GIA": "INDONESIA",
            "LNI": "LION INTER",
            "CTV": "SUPERGREEN",
            "BTK": "BATIK",
            "AWQ": "WAGON AIR",
            "SJY": "SRIWIJAYA"
        }.get(icao_code, raw_telephony.upper())
        callsign = f"{telephony_formal} {num}".strip() if num else telephony_formal

    # Detect Intent
    intent = "UNKNOWN"
    if any(k in normalized_str for k in ["push", "pushback", "start"]):
        intent = "PUSHBACK"
    elif "go around" in normalized_str or "missed approach" in normalized_str or "go round" in normalized_str:
        intent = "GO_AROUND"
    elif "heading" in normalized_str or "turn left" in normalized_str or "turn right" in normalized_str or "fly heading" in normalized_str:
        intent = "VECTOR"
    elif "speed" in normalized_str or "knots" in normalized_str or "reduce speed" in normalized_str or "maintain speed" in normalized_str:
        intent = "SPEED"
    elif "taxi" in normalized_str or "holding point" in normalized_str:
        intent = "TAXI"
    elif "line up" in normalized_str or "wait" in normalized_str:
        intent = "LINE_UP"
    elif "takeoff" in normalized_str or "take off" in normalized_str:
        intent = "TAKEOFF"
    elif "land" in normalized_str or "cleared to land" in normalized_str:
        intent = "LANDING"
    elif "descend" in normalized_str:
        intent = "DESCEND"
    elif "climb" in normalized_str:
        intent = "CLIMB"

    return {
        "clean": cleaned,
        "normalized": normalized_str,
        "callsign": callsign,
        "runway": runway,
        "intent": intent
    }

def calculate_score(transcript: str, target: str) -> int:
    if not transcript or not target:
        return 0
    parsed_actual = sanitize_and_normalize(transcript)
    parsed_target = sanitize_and_normalize(target)
    
    t_words = [w.lower().strip(".,!?") for w in parsed_actual["normalized"].split()]
    target_words = [w.lower().strip(".,!?") for w in parsed_target["normalized"].split()]
    
    matches = 0
    for tw in target_words:
        if any(tw == w or tw in w or w in tw for w in t_words):
            matches += 1
            
    accuracy = int((matches / len(target_words)) * 100)
    # Intent bonus if core intent matches
    if parsed_actual["intent"] != "UNKNOWN" and parsed_actual["intent"] == parsed_target["intent"]:
        accuracy = max(accuracy, 75)
    return min(100, max(0, accuracy))

@app.post("/api/telemetry/event")
async def log_telemetry_event(payload: dict):
    cat = payload.get("category", "SYSTEM")
    title = payload.get("title", "")
    details = payload.get("details", "")
    logger.info(f"[{cat}] {title} | {details}")
    return {"status": "ok"}

@app.get("/api/telemetry/recent")
async def get_recent_telemetry_logs(limit: int = 50):
    if not LOG_FILE.exists():
        return {"logs": []}
    try:
        with open(LOG_FILE, "r") as f:
            lines = f.readlines()
        return {"logs": [l.strip() for l in lines[-limit:]]}
    except Exception as e:
        return {"error": str(e), "logs": []}

# Serve static frontend
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
