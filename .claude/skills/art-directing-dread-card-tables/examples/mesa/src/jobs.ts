// Tiny animation scheduler. Every animation is a pure function of its local time, so it can be
// sampled "on twos" (remote players, 15 fps puppet feel) or smoothly (the local player).
export const REMOTE_FPS = 15

export interface Job {
  start: number
  dur: number
  stepped: boolean
  update(u: number, local: number): void
  done?(): void
}

const jobs: Job[] = []
let now = 0

export const clock = () => now

export function schedule(job: Omit<Job, 'start'> & { delay?: number }): Promise<void> {
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

export const wait = (sec: number) => schedule({ dur: sec, stepped: false, update: () => undefined })

export function tickJobs(time: number) {
  now = time
  const stepped = Math.floor(time * REMOTE_FPS) / REMOTE_FPS
  // Iterate over a snapshot: done() callbacks may schedule new jobs.
  for (const j of [...jobs]) {
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
