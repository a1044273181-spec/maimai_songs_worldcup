"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Song = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  version: string;
  cover: string;
  preview: string | null;
};

type Version = {
  title: string;
  version: string;
  abbr: string;
  era: "classic" | "dx";
  icon: string;
};

type Catalog = {
  updatedAt: string;
  source: string;
  previewSource: string;
  region: "cn";
  versionRule: "lxns-major-version";
  versions: Version[];
  songs: Song[];
};

type WinnerRecord = {
  song: Song;
  versionTitle: string;
  decidedAt: string;
};

type Phase =
  | "home"
  | "roster"
  | "group"
  | "revival"
  | "knockout"
  | "champion"
  | "overview";

type HistoryRecord = {
  id: string;
  stageLabel: string;
  detail: string;
  participants: Song[];
  winners: Song[];
};

type KnockoutRound = {
  number: number;
  label: string;
  participantCount: number;
  matches: Song[][];
  automaticWinners: Song[];
};

const RESULTS_KEY = "mai-cup-results-v4";
const GROUP_SIZE = 4;
const GROUP_PICKS = 2;
const PREVIEW_LIMIT_SECONDS = 30;
const SITE_URL = "https://mai-cup-cn-2026.xzso3.chatgpt.site";
const palette = ["cyan", "lime", "pink", "violet", "orange"];

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function buildRevivalGroups(items: Song[], groupCount: number) {
  const groups = Array.from({ length: groupCount }, () => [] as Song[]);
  shuffle(items).forEach((song, index) => {
    groups[index % groupCount].push(song);
  });
  return groups.filter((group) => group.length);
}

function buildInitialGroups(items: Song[]) {
  const groupCount = Math.ceil(items.length / GROUP_SIZE);
  const groups = Array.from({ length: groupCount }, () => [] as Song[]);
  shuffle(items).forEach((song, index) => {
    groups[index % groupCount].push(song);
  });
  return groups.filter((group) => group.length);
}

function buildKnockoutRound(
  participants: Song[],
  number: number,
): KnockoutRound {
  const mixed = shuffle(participants);
  const participantCount = mixed.length;
  const lowerPower = 2 ** Math.floor(Math.log2(participantCount));
  const pairCount =
    participantCount === lowerPower
      ? participantCount / 2
      : participantCount - lowerPower;
  const pairedSongCount = pairCount * 2;
  const matches = chunk(mixed.slice(0, pairedSongCount), 2);
  const automaticWinners = mixed.slice(pairedSongCount);
  const label =
    participantCount === 8
      ? "四分之一决赛"
      : participantCount === 4
        ? "半决赛"
        : participantCount === 2
          ? "总决赛"
          : `淘汰赛第 ${number} 轮`;

  return {
    number,
    label,
    participantCount,
    matches,
    automaticWinners,
  };
}

function songTone(song: Song, index: number) {
  let hash = 0;
  for (const character of song.id) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return palette[(hash + index) % palette.length];
}

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<"all" | "dx" | "classic">("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, WinnerRecord>>({});
  const [phase, setPhase] = useState<Phase>("home");
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [entrants, setEntrants] = useState<Song[]>([]);
  const [groupStageGroups, setGroupStageGroups] = useState<Song[][]>([]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [groupPicks, setGroupPicks] = useState<string[]>([]);
  const [groupQualified, setGroupQualified] = useState<Song[]>([]);
  const [groupEliminated, setGroupEliminated] = useState<Song[]>([]);
  const [revivalGroups, setRevivalGroups] = useState<Song[][]>([]);
  const [revivalIndex, setRevivalIndex] = useState(0);
  const [revivedSongs, setRevivedSongs] = useState<Song[]>([]);
  const [knockoutRound, setKnockoutRound] =
    useState<KnockoutRound | null>(null);
  const [matchIndex, setMatchIndex] = useState(0);
  const [knockoutWinners, setKnockoutWinners] = useState<Song[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [champion, setChampion] = useState<Song | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, true>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, true>>({});
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [previewSeconds, setPreviewSeconds] = useState(PREVIEW_LIMIT_SECONDS);
  const [exportState, setExportState] = useState<
    | "idle"
    | "rendering"
    | "ready"
    | "saved"
    | "shared"
    | "fallback"
    | "error"
  >("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const posterRef = useRef<HTMLElement | null>(null);
  const posterBlobRef = useRef<Blob | null>(null);
  const exportBusyRef = useRef(false);

  useEffect(() => {
    fetch("/maimai-cn.json")
      .then((response) => {
        if (!response.ok) throw new Error("catalog");
        return response.json() as Promise<Catalog>;
      })
      .then(setCatalog)
      .catch(() => setLoadError(true));

    try {
      const stored = window.localStorage.getItem(RESULTS_KEY);
      if (stored) setResults(JSON.parse(stored));
    } catch {
      // 本地存储不可用时仍可完成本次比赛。
    }
  }, []);

  const stopPreview = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.ontimeupdate = null;
      audio.onended = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
    }
    setPlayingSongId(null);
    setPreviewSeconds(PREVIEW_LIMIT_SECONDS);
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const togglePreview = useCallback(
    async (song: Song) => {
      if (!song.preview || previewErrors[song.id]) return;
      if (playingSongId === song.id) {
        stopPreview();
        return;
      }

      stopPreview();
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.preload = "auto";
      audio.volume = 0.8;
      audio.src = song.preview;
      audio.currentTime = 0;
      audio.load();
      audio.ontimeupdate = () => {
        if (audio.currentTime >= PREVIEW_LIMIT_SECONDS) {
          stopPreview();
          return;
        }
        setPreviewSeconds(
          Math.max(
            0,
            PREVIEW_LIMIT_SECONDS - Math.floor(audio.currentTime),
          ),
        );
      };
      audio.onended = stopPreview;
      audio.onerror = () => {
        setPreviewErrors((current) => ({ ...current, [song.id]: true }));
        stopPreview();
      };

      setPlayingSongId(song.id);
      try {
        await audio.play();
      } catch {
        setPreviewErrors((current) => ({ ...current, [song.id]: true }));
        stopPreview();
      }
    },
    [playingSongId, previewErrors, stopPreview],
  );

  const songCounts = useMemo(() => {
    const counts = new Map<string, number>();
    catalog?.songs.forEach((song) => {
      counts.set(song.version, (counts.get(song.version) ?? 0) + 1);
    });
    return counts;
  }, [catalog]);

  const visibleVersions = useMemo(() => {
    if (!catalog) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.versions.filter((version) => {
      if (filter !== "all" && version.era !== filter) return false;
      return (
        !normalizedQuery ||
        version.title.toLowerCase().includes(normalizedQuery) ||
        version.abbr.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [catalog, filter, query]);

  const overviewStages = useMemo(() => {
    const stages: { label: string; records: HistoryRecord[] }[] = [];
    history.forEach((record) => {
      const stage = stages.find((item) => item.label === record.stageLabel);
      if (stage) stage.records.push(record);
      else stages.push({ label: record.stageLabel, records: [record] });
    });
    return stages;
  }, [history]);

  const currentGroup = groupStageGroups[groupIndex] ?? [];
  const currentRevivalGroup = revivalGroups[revivalIndex] ?? [];
  const currentMatch = knockoutRound?.matches[matchIndex] ?? [];
  const currentVisibleSongs =
    phase === "group"
      ? currentGroup
      : phase === "revival"
        ? currentRevivalGroup
        : phase === "knockout"
          ? currentMatch
          : phase === "champion"
            ? champion
              ? [champion]
              : []
            : entrants;

  useEffect(() => {
    const activeId = playingSongId;
    if (
      activeId &&
      !currentVisibleSongs.some((song) => song.id === activeId)
    ) {
      stopPreview();
    }
  }, [
    currentVisibleSongs,
    playingSongId,
    stopPreview,
  ]);

  function saveChampion(song: Song) {
    if (!selectedVersion) return;
    const record: WinnerRecord = {
      song,
      versionTitle: selectedVersion.title,
      decidedAt: new Date().toISOString(),
    };
    const nextResults = { ...results, [selectedVersion.version]: record };
    setResults(nextResults);
    setChampion(song);
    setPhase("champion");
    stopPreview();
    try {
      window.localStorage.setItem(RESULTS_KEY, JSON.stringify(nextResults));
    } catch {
      // 结果仍会保留到本次会话结束。
    }
  }

  function beginKnockout(participants: Song[], roundNumber: number) {
    if (participants.length === 1) {
      saveChampion(participants[0]);
      return;
    }
    const nextRound = buildKnockoutRound(participants, roundNumber);
    setKnockoutRound(nextRound);
    setKnockoutWinners([]);
    setMatchIndex(0);
    setPhase("knockout");
    stopPreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startBattle(version: Version) {
    if (!catalog) return;
    const participants = shuffle(
      catalog.songs.filter((song) => song.version === version.version),
    );
    if (!participants.length) return;
    const groups = buildInitialGroups(participants);
    const orderedEntrants = groups.flat();
    stopPreview();
    setSelectedVersion(version);
    setEntrants(orderedEntrants);
    setGroupStageGroups(groups);
    setGroupIndex(0);
    setGroupPicks([]);
    setGroupQualified([]);
    setGroupEliminated([]);
    setRevivalGroups([]);
    setRevivalIndex(0);
    setRevivedSongs([]);
    setKnockoutRound(null);
    setKnockoutWinners([]);
    setHistory([]);
    setChampion(null);
    setPhase("roster");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startGroupStage() {
    setGroupIndex(0);
    setGroupPicks([]);
    setPhase("group");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleGroupChoice(song: Song) {
    stopPreview();
    const required = Math.min(GROUP_PICKS, currentGroup.length);
    setGroupPicks((current) => {
      if (current.includes(song.id)) {
        return current.filter((id) => id !== song.id);
      }
      if (current.length >= required) return current;
      return [...current, song.id];
    });
  }

  function confirmGroup() {
    const required = Math.min(GROUP_PICKS, currentGroup.length);
    if (groupPicks.length !== required) return;
    const winners = currentGroup.filter((song) => groupPicks.includes(song.id));
    const eliminated = currentGroup.filter(
      (song) => !groupPicks.includes(song.id),
    );
    const nextQualified = [...groupQualified, ...winners];
    const nextEliminated = [...groupEliminated, ...eliminated];

    setHistory((current) => [
      ...current,
      {
        id: `group-${groupIndex}`,
        stageLabel: "第一轮小组赛",
        detail: `第 ${groupIndex + 1} 组`,
        participants: currentGroup,
        winners,
      },
    ]);
    setGroupQualified(nextQualified);
    setGroupEliminated(nextEliminated);
    setGroupPicks([]);
    stopPreview();

    if (groupIndex < groupStageGroups.length - 1) {
      setGroupIndex((current) => current + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const revivalCount = Math.min(
      nextEliminated.length,
      Math.ceil(nextQualified.length / 3),
    );
    if (!revivalCount) {
      beginKnockout(nextQualified, 1);
      return;
    }
    setRevivalGroups(buildRevivalGroups(nextEliminated, revivalCount));
    setRevivalIndex(0);
    setRevivedSongs([]);
    setPhase("revival");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseRevival(song: Song) {
    const nextRevived = [...revivedSongs, song];
    setHistory((current) => [
      ...current,
      {
        id: `revival-${revivalIndex}`,
        stageLabel: "淘汰复活",
        detail: `复活组 ${revivalIndex + 1}`,
        participants: currentRevivalGroup,
        winners: [song],
      },
    ]);
    setRevivedSongs(nextRevived);
    stopPreview();

    if (revivalIndex < revivalGroups.length - 1) {
      setRevivalIndex((current) => current + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    beginKnockout([...groupQualified, ...nextRevived], 1);
  }

  function chooseKnockout(song: Song) {
    if (!knockoutRound) return;
    const nextWinners = [...knockoutWinners, song];
    const matchRecord: HistoryRecord = {
      id: `knockout-${knockoutRound.number}-${matchIndex}`,
      stageLabel: knockoutRound.label,
      detail: `第 ${matchIndex + 1} 场`,
      participants: currentMatch,
      winners: [song],
    };
    stopPreview();

    if (matchIndex < knockoutRound.matches.length - 1) {
      setHistory((current) => [...current, matchRecord]);
      setKnockoutWinners(nextWinners);
      setMatchIndex((current) => current + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const byeRecords = knockoutRound.automaticWinners.map(
      (automaticWinner, index): HistoryRecord => ({
        id: `bye-${knockoutRound.number}-${index}`,
        stageLabel: knockoutRound.label,
        detail: "轮空晋级",
        participants: [automaticWinner],
        winners: [automaticWinner],
      }),
    );
    setHistory((current) => [...current, matchRecord, ...byeRecords]);
    beginKnockout(
      [...nextWinners, ...knockoutRound.automaticWinners],
      knockoutRound.number + 1,
    );
  }

  useEffect(() => {
    if (!["group", "revival", "knockout"].includes(phase)) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      if (phase === "group" && index >= 0 && index < currentGroup.length) {
        toggleGroupChoice(currentGroup[index]);
      } else if (
        phase === "revival" &&
        index >= 0 &&
        index < currentRevivalGroup.length
      ) {
        chooseRevival(currentRevivalGroup[index]);
      } else if (
        phase === "knockout" &&
        index >= 0 &&
        index < currentMatch.length
      ) {
        chooseKnockout(currentMatch[index]);
      } else if (phase === "group" && event.key === "Enter") {
        confirmGroup();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function goHome() {
    stopPreview();
    setPhase("home");
    setSelectedVersion(null);
    setChampion(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reportImageError(id: string) {
    setImageErrors((current) => ({ ...current, [id]: true }));
  }

  function downloadPoster(blob: Blob, fileName: string) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    requestAnimationFrame(() => URL.revokeObjectURL(objectUrl));
  }

  async function createPosterBlob() {
    const poster = posterRef.current;
    if (!poster) throw new Error("poster");

    await document.fonts?.ready;
    const images = Array.from(poster.querySelectorAll("img"));
    await Promise.all(
      images.map((image) =>
        typeof image.decode === "function"
          ? image.decode().catch(() => undefined)
          : Promise.resolve(),
      ),
    );

    const { toBlob } = await import("html-to-image");
    const posterHeight = poster.scrollHeight;
    const pixelRatio =
      posterHeight > 12000 ? 1 : posterHeight > 8000 ? 1.5 : 2;
    const blob = await toBlob(poster, {
      backgroundColor: "#0b0a12",
      cacheBust: true,
      pixelRatio,
      imagePlaceholder:
        "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
    });
    if (!blob) throw new Error("image");
    return blob;
  }

  function posterFileName() {
    const versionName = selectedVersion?.title ?? "舞萌";
    return `mai-CUP-${versionName}-比赛一图流.png`;
  }

  async function savePosterImage() {
    if (exportBusyRef.current) return;
    exportBusyRef.current = true;
    setExportState("rendering");
    try {
      const blob = posterBlobRef.current ?? (await createPosterBlob());
      posterBlobRef.current = blob;
      downloadPoster(blob, posterFileName());
      setExportState("saved");
    } catch {
      setExportState("error");
    } finally {
      exportBusyRef.current = false;
    }
  }

  async function sharePosterImage() {
    if (exportBusyRef.current) return;
    const blob = posterBlobRef.current;
    if (!blob) {
      setExportState("error");
      return;
    }
    exportBusyRef.current = true;
    try {
      const file = new File([blob], posterFileName(), { type: "image/png" });
      const supportsFileShare =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (supportsFileShare) {
        await navigator.share({
          files: [file],
          title: `${selectedVersion?.title ?? "舞萌"} · mai:CUP 比赛一图流`,
          text: "这是我的舞萌版本本命曲比赛结果。",
        });
        setExportState("shared");
      } else {
        downloadPoster(blob, posterFileName());
        setExportState("fallback");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setExportState("idle");
      } else {
        setExportState("error");
      }
    } finally {
      exportBusyRef.current = false;
    }
  }

  useEffect(() => {
    if (phase !== "overview") {
      posterBlobRef.current = null;
      setExportState("idle");
      return;
    }

    let cancelled = false;
    const frame = requestAnimationFrame(async () => {
      exportBusyRef.current = true;
      setExportState("rendering");
      try {
        const blob = await createPosterBlob();
        if (cancelled) return;
        posterBlobRef.current = blob;
        setExportState("ready");
      } catch {
        if (!cancelled) setExportState("error");
      } finally {
        exportBusyRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [
    phase,
    history.length,
    champion?.id,
    selectedVersion?.version,
  ]);

  function renderSongCards(
    songs: Song[],
    onChoose: (song: Song) => void,
    selectedIds: string[] = [],
    multiSelect = false,
  ) {
    return (
      <div className={`song-grid song-count-${songs.length}`}>
        {songs.map((song, index) => {
          const isPlaying = playingSongId === song.id;
          const isSelected = selectedIds.includes(song.id);
          const previewUnavailable = !song.preview || previewErrors[song.id];
          return (
            <article
              className={`song-card tone-${songTone(song, index)} ${
                isPlaying ? "is-playing" : ""
              } ${isSelected ? "is-selected" : ""}`}
              key={song.id}
            >
              <button
                className="card-select-button"
                type="button"
                aria-pressed={multiSelect ? isSelected : undefined}
                aria-label={
                  multiSelect
                    ? `${isSelected ? "取消选择" : "选择"} ${song.title}`
                    : `选择 ${song.title} 晋级`
                }
                onClick={() => onChoose(song)}
              />
              <span className="shortcut">{index + 1}</span>
              <span className="cover-wrap">
                {!imageErrors[song.id] ? (
                  <img
                    src={song.cover}
                    alt=""
                    loading="eager"
                    onError={() => reportImageError(song.id)}
                  />
                ) : (
                  <span className="cover-fallback" aria-hidden="true">
                    mai
                  </span>
                )}
                <span className="card-glow" />
                {isPlaying && (
                  <span className="playing-badge" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </span>
              <span className="song-copy">
                <span className="song-title">{song.title}</span>
                <span className="song-artist">{song.artist}</span>
                <span className="song-tags">
                  <span>{song.genre}</span>
                  <span>{song.bpm} BPM</span>
                </span>
              </span>
              <span className="song-actions">
                <button
                  className="preview-button"
                  type="button"
                  disabled={previewUnavailable}
                  onClick={() => togglePreview(song)}
                >
                  <span aria-hidden="true">
                    {isPlaying ? "■" : "▶"}
                  </span>
                  {previewUnavailable
                    ? "暂无试听"
                    : isPlaying
                      ? `停止 · ${previewSeconds}s`
                      : "立即试听"}
                </button>
                <span className="pick-label" aria-hidden="true">
                  {multiSelect
                    ? isSelected
                      ? "已选择"
                      : "选择"
                    : "选它晋级"}
                  <span>{isSelected ? "✓" : "→"}</span>
                </span>
              </span>
            </article>
          );
        })}
      </div>
    );
  }

  if (loadError) {
    return (
      <main className="state-page">
        <div className="state-ring">!</div>
        <h1>曲库暂时没有加载成功</h1>
        <p>请刷新页面再试一次。</p>
        <button className="primary-button" onClick={() => location.reload()}>
          重新加载
        </button>
      </main>
    );
  }

  if (!catalog) {
    return (
      <main className="state-page">
        <div className="loading-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>正在装载舞萌中国版曲库</p>
      </main>
    );
  }

  if (phase === "roster" && selectedVersion) {
    const qualifiedCount = groupStageGroups.reduce(
      (total, group) => total + Math.min(GROUP_PICKS, group.length),
      0,
    );
    const revivalCount = Math.ceil(qualifiedCount / 3);
    return (
      <main className="tournament-page roster-page">
        <header className="battle-header">
          <button className="icon-button" onClick={goHome} aria-label="返回">
            ←
          </button>
          <div className="battle-heading">
            <strong>{selectedVersion.title}</strong>
            <span>TOURNAMENT ROSTER</span>
          </div>
          <button
            className="text-button"
            onClick={() => startBattle(selectedVersion)}
          >
            重新分组
          </button>
        </header>
        <section className="roster-shell">
          <div className="round-meta">
            <span className="eyebrow">ALL SONGS · GROUP DRAW</span>
            <h1>
              {entrants.length} 首参赛，分为{" "}
              <span>{groupStageGroups.length} 组</span>
            </h1>
            <p>
              每组最多 {GROUP_SIZE} 首，小组赛必须选出 2 首；随后从落选歌曲中复活{" "}
              {revivalCount} 首。
            </p>
          </div>
          <div className="format-strip">
            <span>
              <strong>{entrants.length}</strong>参赛歌曲
            </span>
            <i>→</i>
            <span>
              <strong>{qualifiedCount}</strong>小组晋级
            </span>
            <i>+</i>
            <span>
              <strong>{revivalCount}</strong>淘汰复活
            </span>
            <i>→</i>
            <span>
              <strong>1</strong>最终冠军
            </span>
          </div>
          <div className="roster-groups">
            {groupStageGroups.map((group, rosterGroupIndex) => (
              <section className="roster-group" key={rosterGroupIndex}>
                <header>
                  <span>GROUP {String(rosterGroupIndex + 1).padStart(2, "0")}</span>
                  <strong>第 {rosterGroupIndex + 1} 组</strong>
                  <small>选 2 首晋级</small>
                </header>
                <div>
                  {group.map((song, songIndex) => (
                    <article className="roster-song" key={song.id}>
                      <span>{songIndex + 1}</span>
                      {!imageErrors[song.id] ? (
                        <img
                          src={song.cover}
                          alt=""
                          onError={() => reportImageError(song.id)}
                        />
                      ) : (
                        <i>mai</i>
                      )}
                      <div>
                        <strong>{song.title}</strong>
                        <small>{song.artist}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="roster-start">
            <button className="primary-button" onClick={startGroupStage}>
              开始第一组小组赛 <span>→</span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (
    ["group", "revival", "knockout"].includes(phase) &&
    selectedVersion
  ) {
    const isGroup = phase === "group";
    const isRevival = phase === "revival";
    const songs = isGroup
      ? currentGroup
      : isRevival
        ? currentRevivalGroup
        : currentMatch;
    const title = isGroup
      ? "第一轮小组赛"
      : isRevival
        ? "淘汰复活"
        : knockoutRound?.label ?? "淘汰赛";
    const currentNumber = isGroup
      ? groupIndex + 1
      : isRevival
        ? revivalIndex + 1
        : matchIndex + 1;
    const totalNumber = isGroup
      ? groupStageGroups.length
      : isRevival
        ? revivalGroups.length
        : knockoutRound?.matches.length ?? 1;
    const progress = (currentNumber / totalNumber) * 100;
    const requiredPicks = Math.min(GROUP_PICKS, currentGroup.length);

    return (
      <main className="battle-page">
        <header className="battle-header">
          <button className="icon-button" onClick={goHome} aria-label="返回">
            ←
          </button>
          <div className="battle-heading">
            <strong>{selectedVersion.title}</strong>
            <span>
              {title} · {isGroup || isRevival ? "GROUP" : "MATCH"}{" "}
              {currentNumber}/{totalNumber}
            </span>
          </div>
          <button
            className="text-button"
            onClick={() => startBattle(selectedVersion)}
          >
            重新开始
          </button>
        </header>

        <section className="battle-stage">
          <div className="round-meta">
            <span className="eyebrow">
              {isGroup
                ? "PICK TWO"
                : isRevival
                  ? "ONE MORE CHANCE"
                  : "HEAD TO HEAD"}
            </span>
            <h1>
              {title}
              <br />
              <span>
                {isGroup
                  ? `选择两首 · ${groupPicks.length}/${requiredPicks}`
                  : isRevival
                    ? `复活一首 · 名额 ${revivalGroups.length}`
                    : "一对一 · 只选一首"}
              </span>
            </h1>
            <p>
              点击歌曲试听按钮后立即播放，最多试听 30 秒；切换歌曲时会自动停止。
            </p>
          </div>
          <div className="progress-row">
            <span>
              {title} · {currentNumber} / {totalNumber}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>

          {renderSongCards(
            songs,
            isGroup
              ? toggleGroupChoice
              : isRevival
                ? chooseRevival
                : chooseKnockout,
            isGroup ? groupPicks : [],
            isGroup,
          )}

          {isGroup && (
            <div className="group-confirm">
              <button
                className="primary-button"
                disabled={groupPicks.length !== requiredPicks}
                onClick={confirmGroup}
              >
                确认这两首晋级 <span>→</span>
              </button>
            </div>
          )}
          <p className="keyboard-hint">
            可按数字键 <kbd>1</kbd>–<kbd>{songs.length}</kbd>{" "}
            选择歌曲{isGroup ? "，选满后按 Enter 确认" : ""}
          </p>
        </section>
      </main>
    );
  }

  if (
    (phase === "champion" || phase === "overview") &&
    selectedVersion &&
    champion
  ) {
    if (phase === "overview") {
      return (
        <main className="overview-page">
          <header className="overview-header">
            <button
              className="icon-button"
              onClick={() => setPhase("champion")}
              aria-label="返回冠军页"
            >
              ←
            </button>
            <div>
              <span className="eyebrow">FULL TOURNAMENT</span>
              <strong>{selectedVersion.title} · 一图流赛程</strong>
            </div>
            <div className="overview-actions">
              <button
                className="export-button"
                type="button"
                disabled={
                  exportState === "rendering" || exportState === "idle"
                }
                onClick={savePosterImage}
              >
                {exportState === "rendering" ? "生成中…" : "保存图片"}
              </button>
              <button
                className="export-button share-button"
                type="button"
                disabled={
                  exportState === "rendering" ||
                  exportState === "idle" ||
                  !posterBlobRef.current
                }
                onClick={sharePosterImage}
              >
                分享图片
              </button>
              <button className="text-button" onClick={goHome}>
                全部版本
              </button>
            </div>
          </header>
          {exportState !== "idle" && (
            <p
              className={`export-status export-status-${exportState}`}
              role="status"
            >
              {exportState === "rendering"
                ? "正在生成完整长图，歌曲较多时需要稍等片刻…"
                : exportState === "ready"
                  ? "完整一图流已经生成，可以保存PNG或直接分享。"
                : exportState === "saved"
                  ? "一图流PNG已保存。"
                  : exportState === "shared"
                    ? "一图流已经发送到系统分享面板。"
                    : exportState === "fallback"
                      ? "当前浏览器不支持直接分享图片，PNG已保存，请从相册或下载目录分享。"
                      : "图片生成失败，请确认歌曲封面加载完成后重试。"}
            </p>
          )}
          <article className="tournament-poster" ref={posterRef}>
            <section className="poster-hero">
              <div className="poster-brand">
                <span className="brand-disc">
                  <i />
                </span>
                <div>
                  <strong>mai:CUP</strong>
                  <small>MAIMAI CHINA FAVORITE TOURNAMENT</small>
                </div>
              </div>
              <div>
                <span className="eyebrow">FULL TOURNAMENT STORY</span>
                <h1>
                  {selectedVersion.title}
                  <br />
                  歌曲世界杯
                </h1>
                <p>
                  从版本完整曲库出发，经过小组赛双选、淘汰复活与一对一淘汰，
                  <br />
                  依次决出八强、四强与最终冠军。下方记录了本次比赛的全部选择。
                </p>
              </div>
              <div className="poster-hero-bottom">
                <div className="poster-stats">
                  <span>
                    <strong>{entrants.length}</strong>参赛歌曲
                  </span>
                  <span>
                    <strong>{groupStageGroups.length}</strong>初始小组
                  </span>
                  <span>
                    <strong>{overviewStages.length}</strong>比赛阶段
                  </span>
                </div>
                <div className="poster-qr">
                  <img src="/site-qr.png" alt="mai:CUP 网站主页二维码" />
                  <div>
                    <strong>扫码开始你的比赛</strong>
                    <span>{SITE_URL.replace("https://", "")}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="poster-champion">
              <div className="poster-crown">♛</div>
              <img src={champion.cover} alt="" />
              <div>
                <span>🏆 CHAMPION · 本届冠军</span>
                <h2>{champion.title}</h2>
                <p>{champion.artist}</p>
                <small>
                  从 {entrants.length} 首歌曲中胜出 · {champion.bpm} BPM
                </small>
              </div>
            </section>

            <section className="poster-section poster-roster-section">
              <header className="poster-section-heading">
                <span>00</span>
                <div>
                  <small>GROUP DRAW</small>
                  <h2>参赛歌曲与初始分组</h2>
                </div>
                <p>每组框选展示 · 每组选择2首晋级</p>
              </header>
              <div className="poster-roster-groups">
                {groupStageGroups.map((group, rosterGroupIndex) => (
                  <article
                    className="poster-roster-group"
                    key={rosterGroupIndex}
                  >
                    <header>
                      <strong>
                        GROUP {String(rosterGroupIndex + 1).padStart(2, "0")}
                      </strong>
                      <span>第 {rosterGroupIndex + 1} 组</span>
                    </header>
                    {group.map((song) => (
                      <div key={song.id}>
                        <img src={song.cover} alt="" />
                        <span>{song.title}</span>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            </section>

            {overviewStages.map((stage, stageIndex) => (
              <section className="poster-section" key={stage.label}>
                <header className="poster-section-heading">
                  <span>{String(stageIndex + 1).padStart(2, "0")}</span>
                  <div>
                    <small>TOURNAMENT STAGE</small>
                    <h2>{stage.label}</h2>
                  </div>
                  <p>{stage.records.length} 场选择</p>
                </header>
                <div className="poster-matches">
                  {stage.records.map((record) => (
                    <article className="poster-match" key={record.id}>
                      <small>{record.detail}</small>
                      {record.participants.map((song) => {
                        const isWinner = record.winners.some(
                          (winner) => winner.id === song.id,
                        );
                        return (
                          <div
                            className={isWinner ? "advanced" : "eliminated"}
                            key={song.id}
                          >
                            <img src={song.cover} alt="" />
                            <span>{song.title}</span>
                            <b>{isWinner ? "晋级" : "淘汰"}</b>
                          </div>
                        );
                      })}
                    </article>
                  ))}
                </div>
              </section>
            ))}

            <footer className="poster-footer">
              <div className="poster-brand">
                <span className="brand-disc">
                  <i />
                </span>
                <div>
                  <strong>mai:CUP</strong>
                  <small>为你的本命曲办一场世界杯</small>
                </div>
              </div>
              <p>
                选择一个舞萌中国版，试听歌曲并完成属于你的完整淘汰赛。
                <br />
                扫描页面顶部二维码或访问 {SITE_URL.replace("https://", "")}
              </p>
            </footer>
          </article>
        </main>
      );
    }

    return (
      <main className="champion-page">
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        <button className="champion-back" onClick={goHome}>
          ← 全部版本
        </button>
        <section className="champion-card">
          <span className="champion-kicker">TOURNAMENT CHAMPION</span>
          <div className="champion-cover">
            {!imageErrors[champion.id] ? (
              <img
                src={champion.cover}
                alt={`${champion.title} 封面`}
                onError={() => reportImageError(champion.id)}
              />
            ) : (
              <span className="cover-fallback">mai</span>
            )}
            <span className="crown">♛</span>
          </div>
          <p className="champion-version">{selectedVersion.title}</p>
          <h1>{champion.title}</h1>
          <p className="champion-artist">{champion.artist}</p>
          <div className="champion-stats">
            <span>{champion.genre}</span>
            <i />
            <span>{champion.bpm} BPM</span>
            <i />
            <span>{entrants.length} 首中胜出</span>
          </div>
          <div className="champion-actions">
            <button
              className="primary-button"
              onClick={() => startBattle(selectedVersion)}
            >
              再开一轮
            </button>
            <button
              className="secondary-button"
              onClick={() => setPhase("overview")}
            >
              观看比赛概览
            </button>
          </div>
          <button className="champion-home-link" onClick={goHome}>
            挑战其他版本 →
          </button>
          <p className="saved-note">冠军结果已保存在这台设备中</p>
        </section>
      </main>
    );
  }

  const completedCount = Object.keys(results).filter((key) =>
    catalog.versions.some((version) => version.version === key),
  ).length;
  const previewCount = catalog.songs.filter((song) => song.preview).length;
  const featuredVersion =
    [...catalog.versions]
      .reverse()
      .find((version) => (songCounts.get(version.version) ?? 0) > 0) ??
    catalog.versions[0];
  const featuredSongs = songCounts.get(featuredVersion.version) ?? 0;

  return (
    <main className="home-page">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="site-header">
        <a className="brand" href="#top" aria-label="mai CUP 首页">
          <span className="brand-disc">
            <i />
          </span>
          <span>
            <strong>mai:CUP</strong>
            <small>VERSION FAVORITE</small>
          </span>
        </a>
        <div className="header-status">
          <span>{completedCount}</span> / {catalog.versions.length}{" "}
          个版本已决出冠军
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow">
            MAIMAI CHINA · {catalog.updatedAt.replaceAll("-", ".")}
          </span>
          <h1>
            从小组赛，
            <br />
            一路战到<span>总决赛</span>。
          </h1>
          <p>
            先浏览完整参赛曲库，小组赛每组选出两首，再通过淘汰复活与
            <br />
            一对一淘汰赛，决出每个舞萌中国版的唯一冠军。
          </p>
          <div className="hero-stats">
            <span>
              <strong>{catalog.songs.length}</strong>
              非宴谱曲目
            </span>
            <span>
              <strong>{catalog.versions.length}</strong>
              历代版本
            </span>
            <span>
              <strong>{previewCount}</strong>
              可试听曲目
            </span>
          </div>
        </div>

        <aside className="quick-start">
          <div className="quick-version-art" aria-hidden="true">
            <img src={featuredVersion.icon} alt="" />
          </div>
          <span className="quick-label">QUICK START · 最新中国版</span>
          <h2>{featuredVersion.title}</h2>
          <p>
            {featuredSongs} 首参赛 · {Math.ceil(featuredSongs / GROUP_SIZE)}{" "}
            个小组
          </p>
          <button
            className="primary-button"
            onClick={() => startBattle(featuredVersion)}
          >
            开始决战 <span>→</span>
          </button>
        </aside>
      </section>

      <section className="version-section" id="versions">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CHOOSE YOUR ERA</span>
            <h2>选择一个版本开战</h2>
          </div>
          <label className="search-field">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索版本"
            />
          </label>
        </div>
        <div className="filter-tabs">
          {[
            ["all", "全部版本"],
            ["classic", "旧框版本"],
            ["dx", "舞萌DX 中国版"],
          ].map(([value, label]) => (
            <button
              className={filter === value ? "active" : ""}
              key={value}
              onClick={() => setFilter(value as typeof filter)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="version-grid">
          {visibleVersions.map((version, index) => {
            const count = songCounts.get(version.version) ?? 0;
            const winner = results[version.version]?.song;
            return (
              <article
                className={`version-card accent-${palette[index % palette.length]} ${
                  winner ? "completed" : ""
                } ${count ? "" : "disabled"}`}
                key={version.version}
              >
                <div className="version-card-top">
                  <span>{winner ? "CHAMPION DECIDED" : "READY"}</span>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div
                  className={`version-art version-art-${version.era}`}
                >
                  <img src={version.icon} alt="" />
                </div>
                <h3>{version.title}</h3>
                <p>
                  {count} 首 · {Math.ceil(count / GROUP_SIZE)} 组
                </p>
                <div className={`version-winner ${winner ? "" : "empty"}`}>
                  <span>{winner ? "CURRENT CHAMPION" : "NO CHAMPION YET"}</span>
                  <strong>{winner?.title ?? "等待你来决出冠军"}</strong>
                </div>
                <button
                  disabled={!count}
                  onClick={() => startBattle(version)}
                >
                  {winner ? "再开一轮" : "开始决战"} <span>→</span>
                </button>
              </article>
            );
          })}
        </div>
        {!visibleVersions.length && (
          <p className="empty-search">没有找到匹配的版本。</p>
        )}
      </section>

      <section className="how-section">
        <div>
          <span className="eyebrow">TOURNAMENT FORMAT</span>
          <h2>一场完整的版本本命曲决战</h2>
        </div>
        <ol>
          <li>
            <span>01</span>
            <strong>小组赛双选</strong>
            <p>展示全部歌曲，每组最多4首并选出2首。</p>
          </li>
          <li>
            <span>02</span>
            <strong>淘汰复活</strong>
            <p>复活数为小组晋级歌曲数的三分之一，向上取整。</p>
          </li>
          <li>
            <span>03</span>
            <strong>一对一淘汰</strong>
            <p>逐轮晋级，依次进入四分之一决赛、半决赛与总决赛。</p>
          </li>
          <li>
            <span>04</span>
            <strong>冠军与概览</strong>
            <p>保存冠军，并可回看从小组赛到总决赛的全部选择。</p>
          </li>
        </ol>
      </section>

      <footer>
        <a className="brand" href="#top">
          <span className="brand-disc">
            <i />
          </span>
          <span>
            <strong>mai:CUP</strong>
            <small>CHINA VERSION</small>
          </span>
        </a>
        <p>
          中国版曲库、版本与封面来自 LXNS；试听来自指定网易云电台。
          宴会场曲目已排除，试听仅播放30秒。
        </p>
      </footer>
    </main>
  );
}
