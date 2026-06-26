import asyncio
import edge_tts
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import io

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Premium, sharp human tech-assistant profile
VOICE_PROFILE = "en-US-EmmaNeural" 

@app.post("/v1/audio/speech")
async def speech(request: Request):
    try:
        body = await request.json()
        text = body.get("input", "")
        
        # Strip out markdown layout clutter cleanly
        clean_text = text.replace("```", "").replace("`", "").replace("*", "")
        
        communicate = edge_tts.Communicate(clean_text, VOICE_PROFILE, rate="+25%", pitch="-2Hz")
        audio_buffer = io.BytesIO()
        
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])
                
        audio_buffer.seek(0)
        return StreamingResponse(audio_buffer, media_type="audio/mp3")
    except Exception as e:
        print(f"[ERR] Pipeline execution error: {e}")
        return {"error": str(e)}, 500

if __name__ == "__main__":
    import uvicorn
    print(f"[VERA CORE] Dedicated Voice Matrix Active ({VOICE_PROFILE}) on Port 8880.")
    uvicorn.run(app, host="127.0.0.1", port=8880)