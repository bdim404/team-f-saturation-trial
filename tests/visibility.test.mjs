import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

// Compile the actual source with the existing dev dependency; no test framework needed.
async function sourceModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`)
}
const { pauseOnHidden } = await sourceModule("../src/lib/visibility.ts")
const { Player } = await sourceModule("../src/lib/audio.ts")

class Page extends EventTarget {
  hidden = false
  change(hidden) {
    this.hidden = hidden
    this.dispatchEvent(new Event("visibilitychange"))
  }
}

test("visible events do not pause; hidden events do", () => {
  const page = new Page()
  let pauses = 0
  const cleanup = pauseOnHidden(page, () => pauses++)
  assert.equal(pauses, 0)
  page.change(false)
  assert.equal(pauses, 0)
  page.change(true)
  assert.equal(pauses, 1)
  page.change(false)
  assert.equal(pauses, 1)
  cleanup()
})

test("an already hidden page pauses on registration", () => {
  const page = new Page()
  page.hidden = true
  let pauses = 0
  const cleanup = pauseOnHidden(page, () => pauses++)
  assert.equal(pauses, 1)
  cleanup()
})

test("cleanup removes the listener and is safe to repeat", () => {
  const page = new Page()
  let pauses = 0
  const cleanup = pauseOnHidden(page, () => pauses++)
  cleanup()
  cleanup()
  page.change(true)
  assert.equal(pauses, 0)
})

test("effect remount leaves only the current listener", () => {
  const page = new Page()
  let oldPauses = 0
  let newPauses = 0
  const oldCleanup = pauseOnHidden(page, () => oldPauses++)
  oldCleanup()
  const cleanup = pauseOnHidden(page, () => newPauses++)
  page.change(true)
  assert.equal(oldPauses, 0)
  assert.equal(newPauses, 1)
  cleanup()
})

test("real Player preserves counters, excludes hidden time and resumes only manually", () => {
  // Synthetic clock and audio nodes: no media, device, network or participant data.
  let context
  class FakeAudioContext {
    currentTime = 0
    destination = {}
    constructor() { context = this }
    resume() { return Promise.resolve() }
    close() { return Promise.resolve() }
    createBufferSource() {
      return { connect(node) { return node }, start() {}, stop() {} }
    }
    createGain() {
      return {
        gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect(node) { return node },
      }
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, "AudioContext")
  Object.defineProperty(globalThis, "AudioContext", { value: FakeAudioContext, configurable: true })
  const page = new Page()
  const player = new Player({
    duration: 20,
    map: { A: "less", B: "base", C: "more" },
    slots: Object.fromEntries(["A", "B", "C"].map(slot => [slot, { buf: {}, gain: 1, drive: 0 }])),
  })
  let snapshot
  const cleanup = pauseOnHidden(page, () => {
    player.pause()
    snapshot = { playing: player.playing, heard: { ...player.heard }, time: player.time() }
  })
  try {
    player.play()
    context.currentTime = 2.03
    page.change(true)
    assert.equal(player.playing, false)
    assert.ok(Math.abs(snapshot.heard.A - 2) < 1e-9)
    assert.equal(snapshot.heard.B, 0)
    assert.equal(snapshot.heard.C, 0)
    assert.ok(Math.abs(snapshot.time - 2) < 1e-9)
    context.currentTime = 60
    page.change(false)
    player.tally()
    assert.equal(player.playing, false)
    assert.deepEqual(player.heard, snapshot.heard)
    player.play()
    context.currentTime = 61.03
    player.pause()
    assert.ok(Math.abs(player.heard.A - 3) < 1e-9)
  } finally {
    cleanup()
    player.dispose()
    if (previous) Object.defineProperty(globalThis, "AudioContext", previous)
    else delete globalThis.AudioContext
  }
})
