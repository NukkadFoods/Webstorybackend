import sys
import asyncio
import edge_tts
import argparse

# Default voice if none specified
DEFAULT_VOICE = "en-US-AriaNeural"

async def main():
    parser = argparse.ArgumentParser(description="Stream Edge TTS audio to stdout")
    parser.add_argument("--text", required=True, help="Text to convert to speech")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="Voice to use")
    
    args = parser.parse_args()
    
    try:
        communicate = edge_tts.Communicate(args.text, args.voice)
        
        # Stream audio chunks directly to stdout buffer
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                sys.stdout.buffer.write(chunk["data"])
                sys.stdout.buffer.flush()
                
    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    asyncio.run(main())
