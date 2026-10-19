# The demo shore

Sample material used by `npm run demo` and by the screenshots in the README. Everything here is
original to this repository: coastal photographs made for the project, essays, hand-built tide
tables, synthesized ambience, and a short film assembled from a still.

Two archives are seeded:

| Folder | Archive | What it demonstrates |
| --- | --- | --- |
| `tide-atlas/` | **Tide Atlas** | Folders, images, Markdown essays, CSV, JSON, plain text, MP3, MP4, PDF, ZIP, and a cover image |
| `harbor-sessions/` | **Harbor Sessions** | Notes, photographs, audio, JSON, and a code sketch with a second cover |

`node.json` configures the demo node and its token. `seed.json` describes the two archives the
demo publishes. The demo script uses the same pairing and sync APIs as a real deployment.

The demo runs in **demo mode**: the console password is `shore` and the UI says so. Never expose
demo mode publicly, and never reuse that password for a real hub.

## Regenerating media

The photographs were generated for this repository and optimized to roughly 1280 px wide. The
video files are short H.264 pans over stills, made with ffmpeg. The audio is synthetic (filtered
noise and detuned sine tones), not a recording of an actual place. If you reuse this folder as a
starting point for your own archive, replace the content but keep the shapes — the variety is what
exercises the viewer.
