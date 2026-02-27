import sys
import os

# Add venv site-packages to path just in case, though we should run with venv python
# Use the absolute path to the venv in the current directory
venv_path = os.path.join(os.getcwd(), "venv/lib/python3.12/site-packages")
if venv_path not in sys.path:
    sys.path.append(venv_path)

try:
    print("Testing kokoro import...")
    from kokoro import KPipeline
    print("Kokoro imported successfully.")
    
    print("Initializing KPipeline...")
    # This might download models, which could take a while or fail if no internet
    pipeline = KPipeline(lang_code='a')
    print("KPipeline initialized successfully.")
    
    print("Generating test audio with split_pattern...")
    # Matches app.py: generator = pipeline(text, voice=voice, speed=speed, split_pattern=r'\n+')
    generator = pipeline("Hello\\nworld", voice='af_heart', speed=1.0, split_pattern=r'\n+')
    chunks = []
    for gs, ps, audio in generator:
        chunks.append(audio)
    
    if chunks:
        print(f"Generated {len(chunks)} audio chunks.")
    else:
        print("No audio chunks generated.")

    print("Testing invalid voice...")
    try:
        generator = pipeline("Test", voice='invalid_voice', speed=1.0)
        for _ in generator: pass
        print("Invalid voice did not raise exception (unexpected).")
    except Exception as e:
        print(f"Invalid voice raised exception: {e}")

    print("Testing concurrent access...")
    import threading
    def run_gen(id):
        try:
            print(f"Thread {id} starting...")
            gen = pipeline("Text from thread " + str(id), voice='af_heart', speed=1.0)
            for _ in gen: pass
            print(f"Thread {id} finished.")
        except Exception as e:
            print(f"Thread {id} failed: {e}")

    threads = [threading.Thread(target=run_gen, args=(i,)) for i in range(3)]
    for t in threads: t.start()
    for t in threads: t.join()
    print("Concurrency test finished.")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
