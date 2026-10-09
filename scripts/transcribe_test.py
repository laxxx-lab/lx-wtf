import importlib.util
import io
from pathlib import Path
import struct
import unittest
import wave

class TranscribeTests(unittest.TestCase):
    def test_resampling_retains_duration_and_pcm_values(self):
        spec=importlib.util.spec_from_file_location('transcribe',Path(__file__).with_name('transcribe.py'))
        self.assertTrue(Path(spec.origin).exists(),'transcription adapter missing')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        buffer=io.BytesIO()
        with wave.open(buffer,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000)
            wav.writeframes(struct.pack('<hhhhhh',0,1200,2400,3600,4800,6000))
        result=module.pcm16_wav(buffer.getvalue())
        with wave.open(io.BytesIO(result),'rb') as wav:
            self.assertEqual((wav.getframerate(),wav.getnchannels(),wav.getsampwidth()),(16000,1,2))
            self.assertEqual(struct.unpack('<hhhh',wav.readframes(4)),(0,1800,3600,5400))
        with self.assertRaises(ValueError):module.pcm16_wav(b'not audio')

if __name__=='__main__':unittest.main()
