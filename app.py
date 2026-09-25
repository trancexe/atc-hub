import os
import io
import json
import tempfile
import asyncio
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="ATC Hub", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)

# Lazy-loaded faster-whisper model
whisper_model = None

def get_whisper():
    global whisper_model
    if whisper_model is None:
        from faster_whisper import WhisperModel
        print("Loading Whisper base.en model...")
        # Using base.en on CPU with INT8 compute for ultra-fast, lightweight inference
        whisper_model = WhisperModel("base.en", device="cpu", compute_type="int8")
        print("Whisper base.en loaded!")
    return whisper_model

# Load airport dataset
AIRPORT_DATA_PATH = BASE_DIR / "wiii_data.json"
airport_data = {}
if AIRPORT_DATA_PATH.exists():
    with open(AIRPORT_DATA_PATH, "r") as f:
        airport_data = json.load(f)

@app.get("/api/airport/wiii")
async def get_airport_wiii():
    return airport_data

# Phraseology lessons & training academy data
TRAINING_LESSONS = [
    {
        "id": "del-1",
        "phase": "Delivery / IFR Clearance",
        "title": "IFR Clearance Depature",
        "aircraft": {"callsign": "GIA123", "airline": "Garuda", "type": "B738", "gate": "Gate E1"},
        "situation": "Garuda 123 bersiap di Gate E1 tujuan Bali (WADD). Pilot meminta IFR clearance rute DOLTA departure.",
        "target_text": "Garuda 123 cleared to Denpasar via DOLTA 1 departure, climb and maintain 4000 feet, squawk 4215",
        "phonetic_tips": "Angka dibaca terpisah: 4000 = FOW-er THOU-sand, squawk 4215 = FOW-er TOO WUN FIFE.",
        "pilot_readback": "Cleared to Denpasar via DOLTA 1 departure, climb and maintain 4000 feet, squawk 4215, Garuda 123."
    },
    {
        "id": "gnd-1",
        "phase": "Ground / Pushback & Taxi",
        "title": "Pushback & Engine Start",
        "aircraft": {"callsign": "GIA123", "airline": "Garuda", "type": "B738", "gate": "Gate E1"},
        "situation": "Pesawat siap pushback dan engine start, menghadap ke arah Barat.",
        "target_text": "Garuda 123 push and start approved, facing west",
        "phonetic_tips": "Jelas dan tegas: PUSH AND START APPROVED, FACING WEST.",
        "pilot_readback": "Push and start approved, facing west, Garuda 123."
    },
    {
        "id": "gnd-2",
        "phase": "Ground / Taxi to Runway",
        "title": "Taxi to Holding Point",
        "aircraft": {"callsign": "GIA123", "airline": "Garuda", "type": "B738", "gate": "Gate E1"},
        "situation": "Pesawat sudah selesai pushback, berikan instruksi taxi ke runway 25R lewat taxiway NC1.",
        "target_text": "Garuda 123 taxi to holding point runway 25 right via North Charlie 1",
        "phonetic_tips": "25 Right = TOO FIFE RIGHT. North Charlie 1 = NORTH CHAR-lee WUN.",
        "pilot_readback": "Taxi to holding point runway 25 right via North Charlie 1, Garuda 123."
    },
    {
        "id": "twr-1",
        "phase": "Tower / Departure",
        "title": "Line Up and Wait",
        "aircraft": {"callsign": "GIA123", "airline": "Garuda", "type": "B738", "pos": "Holding Point 25R"},
        "situation": "Trafik runway sebelumnya sudah lewat, instruksikan Garuda 123 masuk ke runway dan siap-siap.",
        "target_text": "Garuda 123 line up and wait runway 25 right",
        "phonetic_tips": "LINE UP AND WAIT RUNWAY TOO FIFE RIGHT.",
        "pilot_readback": "Line up and wait runway 25 right, Garuda 123."
    },
    {
        "id": "twr-2",
        "phase": "Tower / Takeoff",
        "title": "Takeoff Clearance",
        "aircraft": {"callsign": "GIA123", "airline": "Garuda", "type": "B738", "pos": "Runway 25R"},
        "situation": "Angin 250 derajat 8 knots, runway clear. Berikan izin lepas landas.",
        "target_text": "Garuda 123 wind 250 at 8 knots runway 25 right cleared for takeoff",
        "phonetic_tips": "WIND TOO FIFE ZERO AT EIGHT KNOTS, RUNWAY TOO FIFE RIGHT CLEARED FOR TAKEOFF.",
        "pilot_readback": "Runway 25 right cleared for takeoff, Garuda 123."
    },
    {
        "id": "app-1",
        "phase": "Approach / Inbound STAR",
        "title": "Arrival Clearance & Descent",
        "aircraft": {"callsign": "LNI456", "airline": "Lion Air", "type": "A333", "pos": "Over BUNTO FL180"},
        "situation": "Lion 456 datang dari arah Timur di atas waypoint BUNTO, turunkan ke FL 100 via BUNTO 1A arrival.",
        "target_text": "Lion 456 cleared BUNTO 1 arrival descend and maintain flight level 100",
        "phonetic_tips": "Flight Level 100 = FLIGHT LEVEL WUN HUN-dred.",
        "pilot_readback": "Cleared BUNTO 1 arrival, descend and maintain flight level 100, Lion 456."
    },
    {
        "id": "app-2",
        "phase": "Approach / ILS Intercept",
        "title": "ILS Approach Clearance",
        "aircraft": {"callsign": "LNI456", "airline": "Lion Air", "type": "A333", "pos": "Base Leg 3000ft"},
        "situation": "Pesawat mengarah ke localizer Runway 25L pada ketinggian 3000 kaki. Berikan izin ILS approach.",
        "target_text": "Lion 456 turn left heading 280 cleared ILS runway 25 left approach",
        "phonetic_tips": "HEADING TOO EIGHT ZERO, CLEARED EYE-ELL-ESS RUNWAY TOO FIFE LEFT APPROACH.",
        "pilot_readback": "Turn left heading 280, cleared ILS runway 25 left, Lion 456."
    },
    {
        "id": "twr-3",
        "phase": "Tower / Landing",
        "title": "Landing Clearance",
        "aircraft": {"callsign": "LNI456", "airline": "Lion Air", "type": "A333", "pos": "Final 4 NM"},
        "situation": "Lion 456 di final approach runway 25L, angin tenang. Berikan izin mendarat.",
        "target_text": "Lion 456 wind calm runway 25 left cleared to land",
        "phonetic_tips": "WIND CALM, RUNWAY TOO FIFE LEFT CLEARED TO LAND.",
        "pilot_readback": "Runway 25 left cleared to land, Lion 456."
    },
    {
        "id": "gnd-3",
        "phase": "Ground / Taxi to Gate",
        "title": "Vacate Runway and Taxi to Gate",
        "aircraft": {"callsign": "LNI456", "airline": "Lion Air", "type": "A333", "pos": "Vacated 25L on NP2"},
        "situation": "Pesawat sudah mendarat dan keluar dari runway. Arahkan taxi ke Terminal 1 Gate A3 via NP2.",
        "target_text": "Lion 456 taxi to gate A3 via November Papa 2",
        "phonetic_tips": "GATE ALPHA THREE VIA NO-VEM-BER PAH-PAH TOO.",
        "pilot_readback": "Taxi to gate A3 via November Papa 2, Lion 456."
    }
]

@app.get("/api/academy/lessons")
async def get_academy_lessons():
    return TRAINING_LESSONS

class EvaluationRequest(BaseModel):
    transcription: str
    target_text: str

def score_phraseology(spoken: str, target: str):
    import re
    def normalize(t):
        t = t.lower()
        t = re.sub(r'[^a-z0-9\s]', ' ', t)
        # Aviation phonetic substitutions
        rep = {
            "two five right": "25 right",
            "two five left": "25 left",
            "two four": "24",
            "zero seven left": "07 left",
            "zero seven right": "07 right",
            "zero six": "06",
            "tree": "3",
            "fife": "5",
            "niner": "9",
            "too": "2",
            "to": "2",
            "four": "4",
            "for": "4",
            "one": "1",
            "north charlie": "north charlie",
            "november papa": "november papa",
        }
        for k, v in rep.items():
            t = t.replace(k, v)
        return [w for w in t.split() if w]

    words_spoken = normalize(spoken)
    words_target = normalize(target)
    
    if not words_target:
        return 100, []

    matched = []
    missing = []
    
    for wt in words_target:
        if wt in words_spoken:
            matched.append(wt)
        else:
            missing.append(wt)

    score = int((len(matched) / len(words_target)) * 100)
    return score, missing

@app.post("/api/stt/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    target_text: str = Form("")
):
    try:
        model = get_whisper()
        audio_bytes = await file.read()
        
        # Save temporary wav
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        initial_prompt = "Garuda, Lion, Batik, Citilink, runway 25R, 25L, 07L, 07R, 06, 24, taxiway NC1, NP2, hold short, cleared for takeoff, descend, climb, flight level 100, DOLTA, BUNTO, CKG, squawk, ILS approach."
        
        segments, info = model.transcribe(
            tmp_path,
            beam_size=3,
            language="en",
            initial_prompt=initial_prompt
        )
        
        transcribed_text = " ".join([seg.text.strip() for seg in segments]).strip()
        
        # Clean up temp
        try:
            os.remove(tmp_path)
        except Exception:
            pass

        score = 0
        missing = []
        if target_text:
            score, missing = score_phraseology(transcribed_text, target_text)

        return {
            "success": True,
            "text": transcribed_text,
            "score": score,
            "missing_keywords": missing,
            "duration": round(info.duration, 2)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8010, reload=True)
