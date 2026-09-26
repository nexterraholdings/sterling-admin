"use client";

import { DEFAULT_GRAMMAR, SWEAR_RATES, abbrevHint, abbrevLabel, grammarHint, grammarLabel } from "@/lib/conversations/rules";
import {
  EMPTY_TRAITS,
  LIFE_STAGES,
  TALK_STYLES,
  TEMPERAMENTS,
  ageHint,
  cussMode,
  voiceWithCuss,
  type CussMode,
  type LifeStage,
  type PropTraits,
  type PropVoice,
  type TalkStyle,
  type Temperament,
} from "@/lib/prop-voice";

const CUSS_OPTIONS: Array<{ id: CussMode; label: string }> = [
  { id: "run", label: "Follow the conversation" },
  { id: "off", label: "Off" },
  { id: "rare", label: "Rarely" },
  { id: "sometimes", label: "Sometimes" },
  { id: "often", label: "Often" },
];

export function PropVoiceFields({
  voice,
  disabled,
  fieldClassName,
  onChange,
}: {
  voice: PropVoice;
  disabled?: boolean;
  fieldClassName: string;
  onChange: (next: PropVoice) => void;
}) {
  const traits = voice.traits ?? EMPTY_TRAITS;
  const cuss = cussMode(voice);
  const cussHint =
    cuss === "run"
      ? "Uses whatever this conversation allows."
      : cuss === "off"
        ? "This account stays clean. No cuss words."
        : SWEAR_RATES.find((item) => item.id === cuss)?.hint;

  function setTraits(patch: Partial<PropTraits>) {
    onChange({ ...voice, traits: { ...traits, ...patch } });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-zinc-100">Characteristics</p>
        <p className="mt-1 text-xs text-zinc-500">The writer uses these on every line from this account.</p>
      </div>
      <label className="block text-xs text-zinc-400">
        Age
        <input
          type="number"
          min={13}
          max={99}
          inputMode="numeric"
          className={`${fieldClassName} mt-1`}
          placeholder="16, 18, 42…"
          disabled={disabled}
          value={traits.age ?? ""}
          aria-label="Age"
          onChange={(event) => {
            const raw = event.target.value.trim();
            const next = Number(raw);
            setTraits({ age: raw === "" || !Number.isFinite(next) ? null : next });
          }}
        />
        <p className="mt-1 text-xs text-zinc-500">{ageHint(traits.age)}</p>
      </label>
      <label className="block text-xs text-zinc-400">
        Interests
        <input
          className={`${fieldClassName} mt-1`}
          placeholder="School soccer, the corner store, fixing bikes"
          maxLength={280}
          disabled={disabled}
          value={traits.interests}
          onChange={(event) => setTraits({ interests: event.target.value })}
        />
      </label>
      <ChoiceRow
        label="Temperament"
        hint="How they come across. Select a choice again to clear it."
        value={traits.temperament}
        options={TEMPERAMENTS}
        disabled={disabled}
        onChange={(temperament) => setTraits({ temperament: temperament as Temperament })}
      />
      <ChoiceRow
        label="How much they say"
        hint="Few words stays to one short sentence. Chatty adds a detail."
        value={traits.talk}
        options={TALK_STYLES}
        disabled={disabled}
        onChange={(talk) => setTraits({ talk: talk as TalkStyle })}
      />
      <ChoiceRow
        label="Life"
        hint="What their day is built around. Leave unset to follow the age."
        value={traits.life}
        options={LIFE_STAGES}
        disabled={disabled}
        onChange={(life) => setTraits({ life: life as LifeStage })}
      />
      <label className="block text-xs text-zinc-400">
        Personality
        <textarea
          className={`${fieldClassName} mt-1 min-h-20 resize-y`}
          placeholder="Casual neighbor. Short, specific, a little skeptical."
          maxLength={500}
          disabled={disabled}
          value={voice.personality}
          onChange={(event) => onChange({ ...voice, personality: event.target.value })}
        />
      </label>

      <label className="block text-xs text-zinc-400">
        Cuss words
        <select
          className={`${fieldClassName} mt-1`}
          disabled={disabled}
          value={cuss}
          aria-label="Cuss words for this prop account"
          onChange={(event) => onChange(voiceWithCuss(voice, event.target.value as CussMode))}
        >
          {CUSS_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">{cussHint} No slurs.</p>
      </label>

      <LevelControl
        label="Grammar"
        own={voice.grammar != null}
        value={voice.grammar ?? DEFAULT_GRAMMAR}
        level={voice.grammar == null ? "Follow the conversation" : grammarLabel(voice.grammar)}
        hint={voice.grammar == null ? "Uses the conversation's grammar." : grammarHint(voice.grammar)}
        low="Messy"
        high="Correct"
        disabled={disabled}
        onOwn={(on) => onChange({ ...voice, grammar: on ? (voice.grammar ?? DEFAULT_GRAMMAR) : null })}
        onValue={(grammar) => onChange({ ...voice, grammar })}
      />

      <LevelControl
        label="Abbreviations"
        own={voice.abbrev != null}
        value={voice.abbrev ?? 30}
        level={voice.abbrev == null ? "Follow the conversation" : abbrevLabel(voice.abbrev)}
        hint={voice.abbrev == null ? "Uses the conversation's abbreviations." : abbrevHint(voice.abbrev)}
        low="None"
        high="Heavy"
        disabled={disabled}
        onOwn={(on) => onChange({ ...voice, abbrev: on ? (voice.abbrev ?? 30) : null })}
        onValue={(abbrev) => onChange({ ...voice, abbrev })}
      />

      <label className="block text-xs text-zinc-400">
        Behavior
        <textarea
          className={`${fieldClassName} mt-1 min-h-28 resize-y`}
          placeholder="Short texts. Asks a question before giving an opinion. Talks about the block, not their job. Never starts a fight."
          maxLength={2000}
          disabled={disabled}
          value={voice.behavior}
          onChange={(event) => onChange({ ...voice, behavior: event.target.value })}
        />
        <p className="mt-1 text-xs text-zinc-500">
          Standing instructions for this account. The model follows them on every line, ahead of the conversation&apos;s rules.
        </p>
      </label>
    </div>
  );
}

function ChoiceRow({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-100">{label}</p>
      <p className="text-xs text-zinc-500">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const picked = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={picked}
              onClick={() => onChange(picked ? "" : option.id)}
              className={`rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50 ${
                picked ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100" : "border-zinc-700 text-zinc-300"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LevelControl({
  label,
  own,
  value,
  level,
  hint,
  low,
  high,
  disabled,
  onOwn,
  onValue,
}: {
  label: string;
  own: boolean;
  value: number;
  level: string;
  hint: string;
  low: string;
  high: string;
  disabled?: boolean;
  onOwn: (on: boolean) => void;
  onValue: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-100">{label}</p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
        <span className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">This account</span>
          <button
            type="button"
            role="switch"
            aria-checked={own}
            aria-label={`Set ${label.toLowerCase()} for this account`}
            disabled={disabled}
            onClick={() => onOwn(!own)}
            className={`relative h-7 w-12 shrink-0 rounded-full disabled:opacity-50 ${own ? "bg-cyan-400" : "bg-zinc-700"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-zinc-950 ${own ? "left-6" : "left-1"}`} />
          </button>
        </span>
      </div>
      {own ? <p className="mt-2 text-xs text-cyan-200/90">{level}</p> : null}
      {own ? (
        <>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            disabled={disabled}
            aria-label={label}
            aria-valuetext={level}
            onChange={(event) => onValue(Number(event.target.value))}
            className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-cyan-400 disabled:opacity-50"
          />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
            <span>{low}</span>
            <span>{high}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
