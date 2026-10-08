export const TOPICS = [
  "experience.lifecycle",
  "experience.marker",
  "unreal.state",
  "unreal.commands",
  "sensor.commands",
  "sensor.status",
  "sensor.preview",
  "sensor.session",
  "hrv.raw",
  "hrv.processed",
  "ecg.raw",
  "imu.accelerometer.raw",
  "temperature.raw",
  "eeg.raw",
  "eeg.processed",
  "biofeedback.events",
  "ai.input",
  "ai.output",
  "logger.events",
  "system.events",
] as const;

export type Topic = (typeof TOPICS)[number];
