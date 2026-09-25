import os
import io
import json
import tempfile
import asyncio
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import edge_tts

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

# Aviation Training Lessons
LESSONS = [
    {
        "id": "del-1",
        "phase": "Delivery / IFR Clearance",
        "title": "IFR Clearance Depature",
        "aircraft": {
            "callsign": "GIA123",
            "airline": "Garuda",
            "type": "B738",
            "gate": "Gate E1"
        },
        "situation": "Garuda 123 bersiap di Gate E1 meminta IFR clearance tujuan Surabaya (WARR) via DOLTA 1C departure, initial climb FL140, squawk 4521.",
        "target_text": "Garuda 123 cleared to Surabaya via DOLTA 1C departure, climb FL 140, squawk 4521",
        "phonetic_tips": "Ucapkan: 'Garuda one two three, cleared to Surabaya via DOLTA one Charlie departure, climb flight level one four zero, squawk four five two one'",
        "keywords": ["garuda", "123", "surabaya", "dolta", "140", "4521"],
        "pilot_readback": "Cleared to Surabaya via DOLTA 1C departure, climb FL 140, squawk 4521, Garuda 123."
    },
    {
        "id": "gnd-1",
        "phase": "Ground / Pushback & Taxi",
        "title": "Pushback & Engine Start",
        "aircraft": {
            "callsign": "GIA123",
            "airline": "Garuda",
            "type": "B738",
            "gate": "Gate E1"
        },
        "situation": "Pesawat siap pushback dan start engine di apron Terminal 3, menghadap ke arah Barat.",
        "target_text": "Garuda 123 push and start approved, facing west",
        "phonetic_tips": "Ucapkan: 'Garuda one two three, push and start approved, facing west'",
        "keywords": ["garuda", "123", "push", "start", "approved", "west"],
        "pilot_readback": "Push and start approved, facing west, Garuda 123."
    },
    {
        "id": "gnd-2",
        "phase": "Ground / Taxi to Holding Point",
        "title": "Taxi to Runway 25R via NC1",
        "aircraft": {
            "callsign": "GIA123",
            "airline": "Garuda",
            "type": "B738",
            "gate": "Apron T3"
        },
        "situation": "Pesawat sudah selesai pushback, instruksikan taxi ke holding point Runway 25R lewat taxiway North Cross 1 dan North 2.",
        "target_text": "Garuda 123 taxi to holding point runway 25R via NC1, N2",
        "phonetic_tips": "Ucapkan: 'Garuda one two three, taxi to holding point runway two five right via North Charlie one, November two'",
        "keywords": ["garuda", "123", "taxi", "holding point", "25r", "nc1"],
        "pilot_readback": "Taxi to holding point runway 25R via NC1 and N2, Garuda 123."
    },
    {
        "id": "twr-1",
        "phase": "Tower / Line Up & Takeoff",
        "title": "Line Up & Wait",
        "aircraft": {
            "callsign": "GIA123",
            "airline": "Garuda",
            "type": "B738",
            "gate": "Holding Point 25R"
        },
        "situation": "Ada pesawat mendarat di runway, instruksikan Garuda 123 untuk masuk runway dan tunggu (Line up and wait).",
        "target_text": "Garuda 123 line up and wait runway 25R",
        "phonetic_tips": "Ucapkan: 'Garuda one two three, line up and wait runway two five right'",
        "keywords": ["garuda", "123", "line up", "wait", "25r"],
        "pilot_readback": "Line up and wait runway 25R, Garuda 123."
    },
    {
        "id": "twr-2",
        "phase": "Tower / Takeoff Clearance",
        "title": "Cleared for Takeoff",
        "aircraft": {
            "callsign": "GIA123",
            "airline": "Garuda",
            "type": "B738",
            "gate": "Runway 25R"
        },
        "situation": "Runway sudah bebas, angin 250 derajat 8 knot. Berikan izin lepas landas.",
        "target_text": "Garuda 123 wind 250 at 8 knots, runway 25R cleared for takeoff",
        "phonetic_tips": "Ucapkan: 'Garuda one two three, wind two five zero at eight knots, runway two five right cleared for takeoff'",
        "keywords": ["garuda", "123", "wind", "cleared for takeoff", "25r"],
        "pilot_readback": "Runway 25R cleared for takeoff, Garuda 123."
    },
    {
        "id": "app-1",
        "phase": "Approach / Inbound Vectoring",
        "title": "ILS Approach Clearance",
        "aircraft": {
            "callsign": "LNI456",
            "airline": "Lion Air",
            "type": "A333",
            "gate": "TMA Inbound"
        },
        "situation": "Lion 456 mendekati bandara via DOLTA 1A. Berikan izin ILS approach Runway 25L dan instruksi descend ke 3000 feet.",
        "target_text": "Lion 456 descend to 3000 feet, cleared ILS runway 25L",
        "phonetic_tips": "Ucapkan: 'Lion four five six, descend and maintain three thousand feet, cleared ILS runway two five left'",
        "keywords": ["lion", "456", "descend", "3000", "cleared", "ils", "25l"],
        "pilot_readback": "Descend to 3000 feet, cleared ILS runway 25L, Lion 456."
    },
    {
        "id": "twr-3",
        "phase": "Tower / Final & Landing",
        "title": "Cleared to Land & Vacate",
        "aircraft": {
            "callsign": "LNI456",
            "airline": "Lion Air",
            "type": "A333",
            "gate": "Final Approach"
        },
        "situation": "Lion 456 sudah di final 3 mile. Berikan izin mendarat di Runway 25L, angin tenang.",
        "target_text": "Lion 456 runway 25L cleared to land, wind 250 at 6",
        "phonetic_tips": "Ucapkan: 'Lion four five six, runway two five left cleared to land, wind two five zero at six knots'",
        "keywords": ["lion", "456", "cleared to land", "25l"],
        "pilot_readback": "Runway 25L cleared to land, Lion 456."
    }
]

@app.get("/api/academy/lessons")
async def get_lessons():
    return LESSONS

@app.get("/api/audio/tts")
async def generate_pilot_voice(text: str = Query(..., min_length=1), voice: str = "en-US-GuyNeural"):
    """
    Generate natural pilot radio speech via edge-tts.
    Bypasses Linux host missing speech-dispatcher/festival libraries completely!
    """
    try:
        communicate = edge_tts.Communicate(text, voice)
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
            "Garuda, Lion, Batik, Citilink, Sriwijaya, Super Air Jet, "
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

        score = calculate_score(transcript, target_text) if target_text else 100

        return JSONResponse({
            "success": True,
            "text": transcript.strip(),
            "duration": duration,
            "score": score
        })

    except Exception as e:
        print(f"Transcribe error: {e}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

def calculate_score(transcript: str, target: str) -> int:
    if not transcript or not target:
        return 0
    t_words = [w.lower().strip(".,!?") for w in transcript.split()]
    target_words = [w.lower().strip(".,!?") for w in target.split()]
    
    # Check keyword overlap
    matches = 0
    for tw in target_words:
        if any(tw in w or w in tw for w in t_words):
            matches += 1
            
    accuracy = int((matches / len(target_words)) * 100)
    return min(100, max(0, accuracy))

# Serve static frontend
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
