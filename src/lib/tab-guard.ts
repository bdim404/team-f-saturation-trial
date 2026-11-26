type Bus = {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}

const NAME = 'team-f-study-tabs'

export class TabGuard {
  private bus: Bus | null
  private active = false

  constructor(bus: Bus | null = typeof BroadcastChannel === 'function' ? new BroadcastChannel(NAME) : null) {
    this.bus = bus
    this.bus?.addEventListener('message', event => {
      if (event.data?.type === 'ping' && this.active) this.bus?.postMessage({ type: 'active' })
    })
  }

  hold(active: boolean) {
    this.active = active
  }

  elsewhere(wait = 400): Promise<boolean> {
    const bus = this.bus
    if (!bus) return Promise.resolve(false)
    return new Promise(resolve => {
      const listener = (event: MessageEvent) => {
        if (event.data?.type !== 'active') return
        clearTimeout(timer)
        bus.removeEventListener('message', listener)
        resolve(true)
      }
      const timer = setTimeout(() => {
        bus.removeEventListener('message', listener)
        resolve(false)
      }, wait)
      bus.addEventListener('message', listener)
      bus.postMessage({ type: 'ping' })
    })
  }
}
