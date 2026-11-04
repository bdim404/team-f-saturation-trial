export const config = {
  trialId: "saturation-felt-intensity-01",
  stimulusUrl: import.meta.env.VITE_STIMULUS_URL as string | undefined,
  submitUrl: import.meta.env.VITE_SUBMIT_URL as string | undefined,
  drive: { less: 0, more: 4 },
  minSecondsPerVersion: 3,
  durationMinutes: 2,
}
