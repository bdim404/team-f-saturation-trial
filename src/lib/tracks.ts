import { config, type TrackConfig } from "@/config"
import { buildStimuli, LEVELS, loadStimulus, saturateAll, synthLoop, type Level, type Stimuli } from "@/lib/audio"

export interface LoadedTrack {
  id: string
  stim: Stimuli
  waveform: AudioBuffer
}

const url = (path: string) => (/^https?:/.test(path) ? path : `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`)

async function loadOne(track: TrackConfig): Promise<LoadedTrack> {
  if (track.files) {
    const files = track.files
    const bufs = await Promise.all(LEVELS.map((l) => loadStimulus(url(files[l]))))
    const buffers = Object.fromEntries(LEVELS.map((l, i) => [l, bufs[i]])) as Record<Level, AudioBuffer>
    const drives = Object.fromEntries(LEVELS.map((l) => [l, null])) as Record<Level, null>
    return { id: track.id, stim: await buildStimuli(buffers, drives), waveform: buffers.base }
  }
  const source = track.source ? await loadStimulus(url(track.source)) : await synthLoop()
  return { id: track.id, stim: await buildStimuli(saturateAll(source, config.drive), config.drive), waveform: source }
}

export async function loadTracks() {
  const out: LoadedTrack[] = []
  for (const t of config.tracks) out.push(await loadOne(t))
  return out
}
