import sys
import os

# Add venv to path if needed
sys.path.append(os.path.join(os.getcwd(), 'venv/lib/python3.12/site-packages'))

from kokoro import KPipeline
import numpy as np

def test_text(text, speed=1.0):
    print(f"Testing text: {text} | Speed: {speed}")
    pipeline = KPipeline(lang_code='a')
    voice = 'af_heart'
    try:
        generator = pipeline(text, voice=voice, speed=speed, split_pattern=None)
        for i, (gs, ps, audio) in enumerate(generator):
            print(f"  Chunk {i} generated successfully. Audio shape: {audio.shape}")
    except Exception as e:
        print(f"  FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Test cases based on user screenshot and potential issues
    test_text("(whispers) Though I must warn you - if you're here to ask about the Batcave's new security system, I might need to put you through a few tests first.")
    test_text("adjusts cowl, looks up from the Batcomputer with a smirk")
    test_text("Nice to meet you, Batman. 🦇 Are you here to:")
    test_text("Are you here to: • Discuss a coding issue? I'm happy to review code, find bugs, suggest improvements, or help with security/performance concerns.")
    test_text("Breaking news: Speed 0 ahead.", speed=0.0)
