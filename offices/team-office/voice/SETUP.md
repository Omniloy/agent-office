# Setting up voice for the office (transcription service)

__OWNER__ talks to the office from a phone: a Speak button records the voice, this computer turns the audio into text,
and the text is sent to the lead of the floor that is open. Your job is to get the transcription service running on
THIS computer and leave it running. Nothing leaves the machine: the audio is transcribed locally.

## What "done" means

1. `office-stt.py` (next to this file) is running and answers on `http://127.0.0.1:4330/health`.
2. `~/.omniloy-team/voice/stt.json` exists and points at it.
3. It starts again by itself after a reboot.
4. A test recording comes back as the right text (see "Test").
5. You told __OWNER__ it works. __OWNER__ then opens More > Voice in the office and switches the Speak button on.

## The contract (do not change it; the office depends on it)

- `GET /health` -> `{"ok": true, "engine": "...", "model": "...", "ready": true}`
- `POST /transcribe?context=<words to expect>&language=<optional>` with a WAV body (16 kHz, mono, 16-bit)
  -> `{"text": "...", "language": "...", "seconds": 0.7, "audio": 6.0}`
- Listen on `127.0.0.1` only. The office server is the only client.

`office-stt.py` already implements this for three engines. Use it; only write your own server if none of the
three can run on this machine, and then keep the same contract.

## Choose the engine

| This computer | Engine | Model | Notes |
|---|---|---|---|
| Mac with Apple Silicon, 16 GB or more | `mlx` | `mlx-community/Qwen3-ASR-1.7B-4bit` | Preferred. About 2 GB of memory, well under a second for a short sentence on an M-series Max. Tested. |
| Mac with Apple Silicon, 8 GB | `mlx` | `mlx-community/Qwen3-ASR-0.6B-4bit` | Same engine, smaller model. Check the exact repo name exists before relying on it. |
| Linux or Windows with an NVIDIA GPU (6 GB VRAM or more) | `qwen` | `Qwen/Qwen3-ASR-1.7B` | Uses the `qwen-asr` package on PyTorch + CUDA. NOT tested by whoever wrote this: read the model card first and fix the three lines in `office-stt.py` if its API differs. |
| Anything weaker (no GPU, old laptop, Intel Mac) | `whisper` | `small` (or `base` if it is too slow) | `faster-whisper` on CPU, int8. Works on macOS, Linux and Windows. NOT tested here either. |

How to tell: `uname -sm` (or `systeminfo` on Windows), memory (`sysctl hw.memsize`, `free -h`), GPU (`nvidia-smi`).
If a short sentence takes more than about 3 seconds to come back, drop to the next row.

## Install

Use a dedicated environment so nothing else on the machine changes. `uv` is the simplest on all three systems.

macOS, Apple Silicon:

    uv venv ~/.omniloy-team/voice/venv --python 3.12
    uv pip install --python ~/.omniloy-team/voice/venv/bin/python mlx-audio numpy
    ~/.omniloy-team/voice/venv/bin/python <this folder>/office-stt.py --engine mlx

(If `python3 -c "import mlx_audio"` already works on the machine, you may use that Python instead of a new venv.)

Linux with NVIDIA (Windows is the same with `%USERPROFILE%` paths and `Scripts\python.exe`):

    uv venv ~/.omniloy-team/voice/venv --python 3.12
    uv pip install --python ~/.omniloy-team/voice/venv/bin/python torch qwen-asr numpy   # pick the torch build for the installed CUDA
    ~/.omniloy-team/voice/venv/bin/python <this folder>/office-stt.py --engine qwen

Any machine, CPU only:

    uv venv ~/.omniloy-team/voice/venv --python 3.12
    uv pip install --python ~/.omniloy-team/voice/venv/bin/python faster-whisper numpy
    ~/.omniloy-team/voice/venv/bin/python <this folder>/office-stt.py --engine whisper --model small

The first start downloads the model (hundreds of MB to a few GB). Say so to __OWNER__ before starting if the
connection is metered. The office server needs Node 20 or newer; `uv` and Node install the same way on all three.

## Models that need an account

The Qwen and Whisper models above are open: no account, no token. If you ever use a gated model (the model page
says "You need to agree to share your contact information"), only __OWNER__ can unlock it. Ask with `team-ask`
and give them exactly these steps:

1. Open the model page on huggingface.co while signed in, read the conditions and press "Agree and access".
2. Create a token at huggingface.co/settings/tokens (type: Read).
3. On this computer run `hf auth login` (older installs: `huggingface-cli login`) and paste the token there.

Never ask them to paste the token in a chat, a ticket or a file, and never print it. After they log in, the download
works for you without ever seeing the token. Check the licence too: a non-commercial licence is their decision.

## Keep it running

- macOS: a LaunchAgent in `~/Library/LaunchAgents/com.omniloy.office-stt.plist` with `RunAtLoad` and `KeepAlive`,
  running the command above; `launchctl bootstrap gui/$(id -u) <plist>`.
- Linux: a user unit `~/.config/systemd/user/office-stt.service` with `Restart=always`;
  `systemctl --user enable --now office-stt` and `loginctl enable-linger $USER`.
- Windows: a Task Scheduler task "At log on" that runs the command, with "Restart on failure".

Send the output to `~/.omniloy-team/voice/stt.log`.

## Tell the office where it is

Write `~/.omniloy-team/voice/stt.json`:

    {"url": "http://127.0.0.1:4330", "engine": "mlx", "model": "mlx-community/Qwen3-ASR-1.7B-4bit", "language": "", "keywords": []}

`language` empty means detect it (useful when the owner mixes languages). `keywords` are the words the engine should
expect: put the names of everyone on the teams and the product names. __OWNER__ can edit them later in More > Voice.

## Test

    curl -s http://127.0.0.1:4330/health
    # any 16 kHz mono 16-bit WAV; on macOS:  say -o /tmp/t.aiff "hola equipo" && ffmpeg -y -i /tmp/t.aiff -ar 16000 -ac 1 /tmp/t.wav
    curl -s -X POST --data-binary @/tmp/t.wav "http://127.0.0.1:4330/transcribe?context=hello"

Then ask __OWNER__ to try the Speak button once and confirm the text that arrives.

## If it cannot be done

Tell __OWNER__ plainly what is missing (hardware, a download, a permission) with `team-ask`, and what the options are.
Do not install system-wide packages, change firewall rules or open the service to the network to make it work.
