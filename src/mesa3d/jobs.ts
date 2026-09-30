// Tiny animation scheduler. Every animation is a pure function of its local time, so it can be
// sampled "on twos" (remote players, 15 fps puppet feel) or smoothly (the local player).
// La Base: one scheduler per scene instance (the demo used module globals), so destroy() and
// cargarEstado() can drop every in-flight animation without touching other instances.
export const REMOTE_FPS = 15

export interface Job {
  start: number
  dur: number
  stepped: boolean
  update(u: number, local: number): void
  done?(): void
}

export type Scheduler = ReturnType<typeof makeScheduler>

export function makeScheduler() {
  let jobs: Job[] = []
  let now = 0

  function schedule(job: Omit<Job, 'start'> & { delay?: number }): Promise<void> {
    return new Promise((resolve) => {
      const { delay = 0, done, ...rest } = job
      jobs.push({
        ...rest,
        start: now + delay,
        done: () => {
          done?.()
          resolve()
        },
      })
    })
  }

  const wait = (sec: number) => schedule({ dur: sec, stepped: false, update: () => undefined })

  function tick(time: number) {
    now = time
    const stepped = Math.floor(time * REMOTE_FPS) / REMOTE_FPS
    // Iterate over a snapshot: done() callbacks may schedule new jobs.
    for (const j of [...jobs]) {
      if (!jobs.includes(j)) continue // dropped by clear() from a callback
      const t = j.stepped ? stepped : time
      if (t < j.start) continue
      const local = t - j.start
      const u = j.dur > 0 ? Math.min(1, local / j.dur) : 1
      j.update(u, Math.min(local, j.dur))
      if (u >= 1) {
        jobs.splice(jobs.indexOf(j), 1)
        j.done?.()
      }
    }
  }

  // A job that runs every frame until stop() is called (e.g. a hand resting on a card while the
  // server decides). Never resolves by itself.
  function loop(update: (local: number) => void, stepped: boolean): () => void {
    const job: Job = { start: now, dur: Infinity, stepped, update: (_u, local) => update(local) }
    jobs.push(job)
    return () => {
      const i = jobs.indexOf(job)
      if (i >= 0) jobs.splice(i, 1)
    }
  }

  // Drops every job WITHOUT resolving it: whatever was awaiting it is abandoned (and collected).
  function clear() {
    jobs = []
  }

  return { schedule, wait, loop, tick, clear, clock: () => now }
}
