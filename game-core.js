export const PITCHES = [
  { id: "D4", note: "D", scale: "1", string: "内弦", frequency: 293.66 },
  { id: "E4", note: "E", scale: "2", string: "内弦", frequency: 329.63 },
  { id: "F#4", note: "F♯", scale: "3", string: "内弦", frequency: 369.99 },
  { id: "G4", note: "G", scale: "4", string: "内弦", frequency: 392 },
  { id: "A4", note: "A", scale: "5", string: "外弦", frequency: 440 },
  { id: "B4", note: "B", scale: "6", string: "外弦", frequency: 493.88 },
  { id: "C#5", note: "C♯", scale: "7", string: "外弦", frequency: 554.37 },
  { id: "D5", note: "D", scale: "1·", string: "外弦", frequency: 587.33 },
];

const alternatingNotes = (pitches) =>
  pitches.map((pitch, index) => ({ pitch, bow: index % 2 === 0 ? "pull" : "push" }));

export const SONGS = [
  {
    id: "little-star",
    title: "小星星",
    subtitle: "十四音 · 熟悉音位",
    tempo: 72,
    notes: alternatingNotes(["D4", "D4", "A4", "A4", "B4", "B4", "A4", "G4", "G4", "F#4", "F#4", "E4", "E4", "D4"]),
  },
  {
    id: "jasmine",
    title: "茉莉花",
    subtitle: "十六音 · 练习换弦",
    tempo: 84,
    notes: alternatingNotes(["E4", "G4", "A4", "G4", "E4", "D4", "E4", "G4", "A4", "B4", "A4", "G4", "E4", "G4", "A4", "D5"]),
  },
  {
    id: "horse-race",
    title: "赛马片段",
    subtitle: "十六音 · 保持推拉节奏",
    tempo: 104,
    notes: alternatingNotes(["D4", "F#4", "A4", "D5", "A4", "F#4", "D4", "E4", "F#4", "G4", "A4", "B4", "D5", "B4", "A4", "F#4"]),
  },
];

export const pitchById = (id) => PITCHES.find((pitch) => pitch.id === id) ?? PITCHES[0];

export class PracticeSession {
  constructor(song = SONGS[0]) {
    this.song = song;
    this.reset();
  }

  start() {
    if (this.status === "finished") this.reset();
    this.status = "playing";
    this.message = "看准音位和弓向，慢慢拉稳这一声。";
  }

  pause() {
    if (this.status !== "playing") return;
    this.status = "paused";
    this.message = "已经停在当前音，准备好再继续。";
  }

  reset() {
    this.status = "idle";
    this.activeIndex = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.correct = 0;
    this.misses = 0;
    this.message = "先点“开始练习”，音符会等你慢慢拉。";
  }

  setSong(song) {
    this.song = song;
    this.reset();
  }

  perform(pitch, bow) {
    if (this.status !== "playing") {
      return { hit: false, ignored: true, reason: "not-playing", finished: false };
    }

    const target = this.song.notes[this.activeIndex];
    if (!target) return { hit: false, ignored: true, reason: "finished", finished: true };

    if (target.pitch !== pitch) {
      this.misses += 1;
      this.combo = 0;
      this.message = `音位再试试 ${pitchById(target.pitch).note}，这一音会等你。`;
      return { hit: false, ignored: false, reason: "pitch", finished: false };
    }

    if (target.bow !== bow) {
      this.misses += 1;
      this.combo = 0;
      this.message = `方向反啦，这一音要${target.bow === "pull" ? "向右拉" : "向左推"}。`;
      return { hit: false, ignored: false, reason: "bow", finished: false };
    }

    this.correct += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += 100 + Math.max(0, this.combo - 1) * 10;
    this.activeIndex += 1;

    if (this.activeIndex >= this.song.notes.length) {
      this.status = "finished";
      this.message = "这一曲拉完了，每一音都是你亲手奏出的。";
      return { hit: true, ignored: false, reason: "correct", finished: true };
    }

    this.message = this.combo >= 4
      ? `连弓很稳，下一音是 ${pitchById(this.song.notes[this.activeIndex].pitch).note}。`
      : "正中这一音，准备下一声。";
    return { hit: true, ignored: false, reason: "correct", finished: false };
  }

  snapshot() {
    const attempts = this.correct + this.misses;
    return {
      status: this.status,
      activeIndex: Math.min(this.activeIndex, this.song.notes.length - 1),
      completed: this.activeIndex,
      total: this.song.notes.length,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      correct: this.correct,
      misses: this.misses,
      accuracy: attempts === 0 ? 100 : Math.round((this.correct / attempts) * 100),
      message: this.message,
    };
  }
}
