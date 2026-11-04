export const SR = 44100
const TARGET_LUFS = -20

export type Level = "less" | "more"
export type Slot = "A" | "B"

export interface Version {
  buf: AudioBuffer
  gain: number
  drive: number
}

export interface Stimuli {
  slots: Record<Slot, Version>
  map: Record<Slot, Level>
  duration: number
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

export async function synthLoop(): Promise<AudioBuffer> {
  const bpm = 112
  const beat = 60 / bpm
  const bars = 8
  const dur = bars * 4 * beat
  const oc = new OfflineAudioContext(2, Math.ceil(dur * SR), SR)
  const master = oc.createGain()
  master.gain.value = 0.8
  master.connect(oc.destination)
  const noise = oc.createBuffer(1, SR, SR)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
  const chords = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]]
  const roots = [36, 43, 45, 41]
  const env = (g: GainNode, t: number, a: number, peak: number, rel: number) => {
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel)
  }

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat
    const ci = bar % 4
    chords[ci].forEach((m, k) =>
      [-7, 7].forEach((cents) => {
        const o = oc.createOscillator()
        o.type = "sawtooth"
        o.frequency.value = mtof(m)
        o.detune.value = cents
        const f = oc.createBiquadFilter()
        f.type = "lowpass"
        f.frequency.value = 1600
        const g = oc.createGain()
        const p = oc.createStereoPanner()
        p.pan.value = (k - 1) * 0.5 * Math.sign(cents)
        g.gain.setValueAtTime(0, t0)
        g.gain.linearRampToValueAtTime(0.035, t0 + 0.08)
        g.gain.setValueAtTime(0.035, t0 + 4 * beat - 0.1)
        g.gain.linearRampToValueAtTime(0, t0 + 4 * beat)
        o.connect(f).connect(g).connect(p).connect(master)
        o.start(t0)
        o.stop(t0 + 4 * beat)
      }),
    )
    for (let e = 0; e < 8; e++) {
      const t = t0 + (e * beat) / 2
      const o = oc.createOscillator()
      o.type = "sawtooth"
      o.frequency.value = mtof(roots[ci] + (e === 7 ? 12 : 0))
      const f = oc.createBiquadFilter()
      f.type = "lowpass"
      f.frequency.value = 520
      f.Q.value = 4
      const g = oc.createGain()
      env(g, t, 0.005, 0.22, beat / 2 - 0.02)
      o.connect(f).connect(g).connect(master)
      o.start(t)
      o.stop(t + beat / 2)
      const h = oc.createBufferSource()
      h.buffer = noise
      const hf = oc.createBiquadFilter()
      hf.type = "highpass"
      hf.frequency.value = 7500
      const hg = oc.createGain()
      env(hg, t, 0.001, e % 2 ? 0.05 : 0.09, 0.04)
      const hp = oc.createStereoPanner()
      hp.pan.value = 0.3
      h.connect(hf).connect(hg).connect(hp).connect(master)
      h.start(t, Math.random() * 0.5, 0.08)
    }
    ;[0, 2, 2.5].forEach((b) => {
      const t = t0 + b * beat
      const o = oc.createOscillator()
      o.frequency.setValueAtTime(130, t)
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
      const g = oc.createGain()
      env(g, t, 0.002, 0.9, 0.32)
      o.connect(g).connect(master)
      o.start(t)
      o.stop(t + 0.4)
    })
    ;[1, 3].forEach((b) => {
      const t = t0 + b * beat
      const n = oc.createBufferSource()
      n.buffer = noise
      const f = oc.createBiquadFilter()
      f.type = "highpass"
      f.frequency.value = 1400
      const g = oc.createGain()
      env(g, t, 0.002, 0.32, 0.17)
      n.connect(f).connect(g).connect(master)
      n.start(t, Math.random() * 0.5, 0.25)
      const o = oc.createOscillator()
      o.type = "triangle"
      o.frequency.value = 190
      const g2 = oc.createGain()
      env(g2, t, 0.002, 0.25, 0.08)
      o.connect(g2).connect(master)
      o.start(t)
      o.stop(t + 0.15)
    })
  }

  const mel = [[0, 72, 1], [1, 74, 1], [2, 76, 2], [4, 74, 1], [5, 71, 1], [6, 67, 2], [8, 72, 1], [9, 76, 1], [10, 79, 1], [11, 76, 1], [12, 77, 1], [13, 76, 1], [14, 72, 2],
    [16, 76, 1], [17, 79, 1], [18, 84, 2], [20, 83, 1], [21, 79, 1], [22, 74, 2], [24, 76, 1], [25, 72, 1], [26, 69, 1], [27, 72, 1], [28, 72, 4]]
  mel.forEach(([b, m, d]) => {
    const t = b * beat
    const len = d * beat
    const o = oc.createOscillator()
    o.type = "square"
    o.frequency.value = mtof(m)
    const lfo = oc.createOscillator()
    lfo.frequency.value = 5.5
    const lg = oc.createGain()
    lg.gain.value = 8
    lfo.connect(lg).connect(o.detune)
    const f = oc.createBiquadFilter()
    f.type = "lowpass"
    f.frequency.value = 2600
    const g = oc.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.06, t + 0.02)
    g.gain.setValueAtTime(0.06, t + len - 0.06)
    g.gain.linearRampToValueAtTime(0, t + len - 0.01)
    o.connect(f).connect(g).connect(master)
    o.start(t)
    o.stop(t + len)
    lfo.start(t)
    lfo.stop(t + len)
  })
  return oc.startRendering()
}

export async function loadStimulus(url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`)
  const dc = new OfflineAudioContext(2, SR, SR)
  return dc.decodeAudioData(await res.arrayBuffer())
}

function peakOf(buf: AudioBuffer) {
  let p = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i])
      if (a > p) p = a
    }
  }
  return p
}

function saturate(buf: AudioBuffer, drive: number) {
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: buf.length, sampleRate: buf.sampleRate })
  const norm = 1 / (peakOf(buf) || 1)
  const k = drive > 0 ? Math.tanh(drive) : 1
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c)
    const y = out.getChannelData(c)
    for (let i = 0; i < x.length; i++) y[i] = drive > 0 ? Math.tanh(drive * x[i] * norm) / k : x[i] * norm
  }
  return out
}

async function loudness(buf: AudioBuffer) {
  const oc = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate)
  const s = oc.createBufferSource()
  s.buffer = buf
  const shelf = oc.createBiquadFilter()
  shelf.type = "highshelf"
  shelf.frequency.value = 1681
  shelf.gain.value = 4
  const hp = oc.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = 38
  hp.Q.value = 0.5
  s.connect(shelf).connect(hp).connect(oc.destination)
  s.start()
  const r = await oc.startRendering()
  let sum = 0
  for (let c = 0; c < r.numberOfChannels; c++) {
    const d = r.getChannelData(c)
    let m = 0
    for (let i = 0; i < d.length; i++) m += d[i] * d[i]
    sum += m / d.length
  }
  return -0.691 + 10 * Math.log10(sum || 1e-12)
}

export async function buildStimuli(source: AudioBuffer, driveLess: number, driveMore: number): Promise<Stimuli> {
  const low = saturate(source, driveLess)
  const high = saturate(source, driveMore)
  const [lL, lH] = await Promise.all([loudness(low), loudness(high)])
  let gL = Math.pow(10, (TARGET_LUFS - lL) / 20)
  let gH = Math.pow(10, (TARGET_LUFS - lH) / 20)
  const worst = Math.max(peakOf(low) * gL, peakOf(high) * gH)
  if (worst > 0.98) {
    gL *= 0.98 / worst
    gH *= 0.98 / worst
  }
  const less: Version = { buf: low, gain: gL, drive: driveLess }
  const more: Version = { buf: high, gain: gH, drive: driveMore }
  const lessIsA = Math.random() < 0.5
  return {
    slots: { A: lessIsA ? less : more, B: lessIsA ? more : less },
    map: { A: lessIsA ? "less" : "more", B: lessIsA ? "more" : "less" },
    duration: source.duration,
  }
}

export class Player {
  private ctx: AudioContext | null = null
  private nodes: Record<Slot, { src: AudioBufferSourceNode; sw: GainNode }> | null = null
  private startedAt = 0
  private offset = 0
  private lastMark: number | null = null
  playing = false
  active: Slot = "A"
  heard: Record<Slot, number> = { A: 0, B: 0 }
  switches = 0
  private stim: Stimuli

  constructor(stim: Stimuli) {
    this.stim = stim
  }

  time() {
    if (!this.playing || !this.ctx) return this.offset
    return (this.offset + this.ctx.currentTime - this.startedAt) % this.stim.duration
  }

  tally() {
    if (this.playing && this.ctx && this.lastMark !== null) {
      const t = this.ctx.currentTime
      this.heard[this.active] += t - this.lastMark
      this.lastMark = t
    }
  }

  play() {
    if (this.playing) return
    if (!this.ctx) this.ctx = new AudioContext()
    const ctx = this.ctx
    void ctx.resume()
    const t = ctx.currentTime + 0.03
    const make = (k: Slot) => {
      const src = ctx.createBufferSource()
      src.buffer = this.stim.slots[k].buf
      src.loop = true
      const match = ctx.createGain()
      match.gain.value = this.stim.slots[k].gain
      const sw = ctx.createGain()
      sw.gain.value = k === this.active ? 1 : 0
      src.connect(match).connect(sw).connect(ctx.destination)
      src.start(t, this.offset % this.stim.duration)
      return { src, sw }
    }
    this.nodes = { A: make("A"), B: make("B") }
    this.startedAt = t
    this.lastMark = t
    this.playing = true
  }

  pause() {
    if (!this.playing || !this.nodes) return
    this.tally()
    this.offset = this.time()
    this.playing = false
    this.lastMark = null
    for (const k of ["A", "B"] as Slot[]) {
      try {
        this.nodes[k].src.stop()
      } catch {
        void 0
      }
    }
    this.nodes = null
  }

  select(k: Slot) {
    if (k === this.active) return
    this.tally()
    this.active = k
    this.switches++
    if (this.playing && this.nodes && this.ctx) {
      const t = this.ctx.currentTime
      for (const v of ["A", "B"] as Slot[]) {
        const g = this.nodes[v].sw.gain
        g.cancelScheduledValues(t)
        g.setValueAtTime(g.value, t)
        g.linearRampToValueAtTime(v === k ? 1 : 0, t + 0.03)
      }
    }
  }

  dispose() {
    this.pause()
    void this.ctx?.close()
    this.ctx = null
  }
}
