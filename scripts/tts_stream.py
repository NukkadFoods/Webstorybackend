import sys
import asyncio
import argparse

# Default voice if none specified
DEFAULT_VOICE = "en-US-AriaNeural"

async def main():
    parser = argparse.ArgumentParser(description="Stream Edge TTS audio to stdout")
    parser.add_argument("--text", required=True, help="Text to convert to speech")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="Voice to use")

    args = parser.parse_args()

    sys.stderr.write(f"[TTS-PY] Starting with text length: {len(args.text)}, voice: {args.voice}\n")
    sys.stderr.flush()

    try:
        import edge_tts
        sys.stderr.write("[TTS-PY] edge_tts imported successfully\n")
        sys.stderr.flush()

        communicate = edge_tts.Communicate(args.text, args.voice)
        sys.stderr.write("[TTS-PY] Communicate object created, starting stream...\n")
        sys.stderr.flush()

        chunk_count = 0
        total_bytes = 0

        # Stream audio chunks directly to stdout buffer
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                data = chunk["data"]
                total_bytes += len(data)
                chunk_count += 1
                sys.stdout.buffer.write(data)
                sys.stdout.buffer.flush()
                if chunk_count == 1:
                    sys.stderr.write(f"[TTS-PY] First audio chunk received: {len(data)} bytes\n")
                    sys.stderr.flush()

        sys.stderr.write(f"[TTS-PY] Completed: {chunk_count} chunks, {total_bytes} total bytes\n")
        sys.stderr.flush()

    except ImportError as e:
        sys.stderr.write(f"[TTS-PY] Import error: {str(e)}\n")
        sys.stderr.write("[TTS-PY] Make sure edge-tts is installed: pip install edge-tts\n")
        sys.stderr.flush()
        sys.exit(1)
    except Exception as e:
        sys.stderr.write(f"[TTS-PY] Error: {type(e).__name__}: {str(e)}\n")
        sys.stderr.flush()
        sys.exit(1)

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    asyncio.run(main())
