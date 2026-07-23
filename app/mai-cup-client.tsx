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

type PersistedTournamentState = {
  schemaVersion: 1;
  savedAt: string;
  phase: Exclude<Phase, "home">;
  selectedVersion: Version;
  entrants: Song[];
  groupStageGroups: Song[][];
  groupIndex: number;
  groupPicks: string[];
  groupQualified: Song[];
  groupEliminated: Song[];
  revivalGroups: Song[][];
  revivalIndex: number;
  revivedSongs: Song[];
  knockoutRound: KnockoutRound | null;
  matchIndex: number;
  knockoutWinners: Song[];
  history: HistoryRecord[];
  champion: Song | null;
};

const RESULTS_KEY = "mai-cup-results-v4";
const TOURNAMENT_STATE_KEY = "mai-cup-active-tournament-v1";
const GROUP_SIZE = 4;
const GROUP_PICKS = 2;
const PREVIEW_LIMIT_SECONDS = 30;
const POSTER_EXPORT_WIDTH = 1080;
const POSTER_EXPORT_HEIGHT = 1920;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://mai-cup-cn-2026.xzso3.chatgpt.site";
const SITE_QR_IMAGE =
  process.env.NEXT_PUBLIC_SITE_QR_IMAGE ?? "/site-qr.png";
const PUBLIC_SITE_URL = `${SITE_URL.replace(/\/$/, "")}${BASE_PATH}/`;
const PREVIEW_SOURCE_URL =
  "https://music.163.com/djradio?id=969217156&uct2=U2FsdGVkX18aTLvxAyeaG7AMBnYSuIXdv61N0TdPrFk=";
const INSPIRATION_URL = "https://musiccup.app/?lang=hans";
const CATALOG_SOURCE_URL = "https://arcade-songs.zetaraku.dev/maimai/";
const palette = ["cyan", "lime", "pink", "violet", "orange"];

function assetPath(path: string) {
  return path.startsWith("/") ? `${BASE_PATH}${path}` : path;
}

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
    | "copied"
    | "qq-help"
    | "fallback"
    | "error"
  >("idle");
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(
    null,
  );
  const [sessionReady, setSessionReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const posterRef = useRef<HTMLElement | null>(null);
  const posterBlobRef = useRef<Blob | null>(null);
  const posterPreviewUrlRef = useRef<string | null>(null);
  const exportBusyRef = useRef(false);

  useEffect(() => {
    fetch(assetPath("/maimai-cn.json"))
      .then((response) => {
        if (!response.ok) throw new Error("catalog");
        return response.json() as Promise<Catalog>;
      })
      .then(setCatalog)
      .catch(() => setLoadError(true));

    try {
      const stored = window.localStorage.getItem(RESULTS_KEY);
      if (stored) setResults(JSON.parse(stored));

      const savedTournament = window.localStorage.getItem(
        TOURNAMENT_STATE_KEY,
      );
      if (savedTournament) {
        const saved = JSON.parse(
          savedTournament,
        ) as Partial<PersistedTournamentState>;
        if (
          saved.schemaVersion === 1 &&
          saved.phase &&
          saved.phase !== "home" &&
          saved.selectedVersion &&
          Array.isArray(saved.entrants) &&
          Array.isArray(saved.groupStageGroups)
        ) {
          setSelectedVersion(saved.selectedVersion);
          setEntrants(saved.entrants);
          setGroupStageGroups(saved.groupStageGroups);
          setGroupIndex(saved.groupIndex ?? 0);
          setGroupPicks(saved.groupPicks ?? []);
          setGroupQualified(saved.groupQualified ?? []);
          setGroupEliminated(saved.groupEliminated ?? []);
          setRevivalGroups(saved.revivalGroups ?? []);
          setRevivalIndex(saved.revivalIndex ?? 0);
          setRevivedSongs(saved.revivedSongs ?? []);
          setKnockoutRound(saved.knockoutRound ?? null);
          setMatchIndex(saved.matchIndex ?? 0);
          setKnockoutWinners(saved.knockoutWinners ?? []);
          setHistory(saved.history ?? []);
          setChampion(saved.champion ?? null);
          setPhase(saved.phase);
        }
      }
    } catch {
      // 本地存储不可用时仍可完成本次比赛。
    } finally {
      setSessionReady(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionReady) return;

    try {
      if (phase === "home" || !selectedVersion) {
        window.localStorage.removeItem(TOURNAMENT_STATE_KEY);
        return;
      }

      const snapshot: PersistedTournamentState = {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        phase,
        selectedVersion,
        entrants,
        groupStageGroups,
        groupIndex,
        groupPicks,
        groupQualified,
        groupEliminated,
        revivalGroups,
        revivalIndex,
        revivedSongs,
        knockoutRound,
        matchIndex,
        knockoutWinners,
        history,
        champion,
      };
      window.localStorage.setItem(
        TOURNAMENT_STATE_KEY,
        JSON.stringify(snapshot),
      );
    } catch {
      // 存储空间或隐私设置不允许时，不影响当前比赛继续进行。
    }
  }, [
    sessionReady,
    phase,
    selectedVersion,
    entrants,
    groupStageGroups,
    groupIndex,
    groupPicks,
    groupQualified,
    groupEliminated,
    revivalGroups,
    revivalIndex,
    revivedSongs,
    knockoutRound,
    matchIndex,
    knockoutWinners,
    history,
    champion,
  ]);

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

  const posterRouteStages = useMemo(() => {
    const knockoutStages = overviewStages.filter(
      (stage) =>
        stage.label !== "第一轮小组赛" && stage.label !== "淘汰复活",
    );
    return knockoutStages.slice(-5, -1).map((stage) => {
      const seen = new Set<string>();
      const winners = stage.records
        .flatMap((record) => record.winners)
        .filter((song) => {
          if (seen.has(song.id)) return false;
          seen.add(song.id);
          return true;
        });
      return { ...stage, winners };
    });
  }, [overviewStages]);

  const posterSummary = useMemo(
    () => ({
      groupMatches: history.filter(
        (record) => record.stageLabel === "第一轮小组赛",
      ).length,
      revivalMatches: history.filter(
        (record) => record.stageLabel === "淘汰复活",
      ).length,
      knockoutMatches: history.filter(
        (record) =>
          record.stageLabel !== "第一轮小组赛" &&
          record.stageLabel !== "淘汰复活",
      ).length,
    }),
    [history],
  );

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

  function rewindGroup(groupToRestore: number) {
    const recordId = `group-${groupToRestore}`;
    const restoredRecord = history.find((record) => record.id === recordId);
    const restoredSongIds = new Set(
      (groupStageGroups[groupToRestore] ?? []).map((song) => song.id),
    );

    setGroupIndex(groupToRestore);
    setGroupPicks(restoredRecord?.winners.map((song) => song.id) ?? []);
    setGroupQualified((current) =>
      current.filter((song) => !restoredSongIds.has(song.id)),
    );
    setGroupEliminated((current) =>
      current.filter((song) => !restoredSongIds.has(song.id)),
    );
    setHistory((current) =>
      current.filter((record) => {
        const groupMatch = /^group-(\d+)$/.exec(record.id);
        return groupMatch ? Number(groupMatch[1]) < groupToRestore : false;
      }),
    );
    setRevivalGroups([]);
    setRevivalIndex(0);
    setRevivedSongs([]);
    setKnockoutRound(null);
    setMatchIndex(0);
    setKnockoutWinners([]);
    setChampion(null);
    setPhase("group");
  }

  function rewindRevival(revivalToRestore: number) {
    const recordId = `revival-${revivalToRestore}`;
    const restoredRecord = history.find((record) => record.id === recordId);
    const restoredWinnerIds = new Set(
      restoredRecord?.winners.map((song) => song.id) ?? [],
    );

    setRevivalIndex(revivalToRestore);
    setRevivedSongs((current) =>
      current.filter((song) => !restoredWinnerIds.has(song.id)),
    );
    setHistory((current) =>
      current.filter((record) => {
        if (record.id.startsWith("group-")) return true;
        const revivalMatch = /^revival-(\d+)$/.exec(record.id);
        return revivalMatch
          ? Number(revivalMatch[1]) < revivalToRestore
          : false;
      }),
    );
    setKnockoutRound(null);
    setMatchIndex(0);
    setKnockoutWinners([]);
    setChampion(null);
    setPhase("revival");
  }

  function roundFromHistory(roundNumber: number) {
    const matchRecords = history
      .filter((record) =>
        record.id.startsWith(`knockout-${roundNumber}-`),
      )
      .sort((left, right) => {
        const leftIndex = Number(left.id.split("-").at(-1));
        const rightIndex = Number(right.id.split("-").at(-1));
        return leftIndex - rightIndex;
      });
    const byeRecords = history.filter((record) =>
      record.id.startsWith(`bye-${roundNumber}-`),
    );
    if (!matchRecords.length) return null;

    const matches = matchRecords.map((record) => record.participants);
    const automaticWinners = byeRecords.flatMap(
      (record) => record.participants,
    );
    return {
      number: roundNumber,
      label: matchRecords[0].stageLabel,
      participantCount:
        matches.reduce((total, match) => total + match.length, 0) +
        automaticWinners.length,
      matches,
      automaticWinners,
    } satisfies KnockoutRound;
  }

  function rewindKnockout(
    roundToRestore: KnockoutRound,
    matchToRestore: number,
  ) {
    const winnerRecords = history
      .filter((record) => {
        const match = /^knockout-(\d+)-(\d+)$/.exec(record.id);
        return (
          match &&
          Number(match[1]) === roundToRestore.number &&
          Number(match[2]) < matchToRestore
        );
      })
      .sort((left, right) => {
        const leftIndex = Number(left.id.split("-").at(-1));
        const rightIndex = Number(right.id.split("-").at(-1));
        return leftIndex - rightIndex;
      });

    setHistory((current) =>
      current.filter((record) => {
        if (
          record.id.startsWith("group-") ||
          record.id.startsWith("revival-")
        ) {
          return true;
        }
        const knockoutMatch = /^knockout-(\d+)-(\d+)$/.exec(record.id);
        if (knockoutMatch) {
          const recordRound = Number(knockoutMatch[1]);
          const recordMatch = Number(knockoutMatch[2]);
          return (
            recordRound < roundToRestore.number ||
            (recordRound === roundToRestore.number &&
              recordMatch < matchToRestore)
          );
        }
        const byeMatch = /^bye-(\d+)-(\d+)$/.exec(record.id);
        return byeMatch
          ? Number(byeMatch[1]) < roundToRestore.number
          : false;
      }),
    );
    setKnockoutRound(roundToRestore);
    setMatchIndex(matchToRestore);
    setKnockoutWinners(winnerRecords.flatMap((record) => record.winners));
    setChampion(null);
    setPhase("knockout");
  }

  function clearSavedChampion() {
    if (!selectedVersion) return;
    const nextResults = { ...results };
    delete nextResults[selectedVersion.version];
    setResults(nextResults);
    try {
      window.localStorage.setItem(RESULTS_KEY, JSON.stringify(nextResults));
    } catch {
      // 本次会话中的冠军状态仍会被清除。
    }
  }

  function goToPreviousStage() {
    stopPreview();

    if (phase === "overview") {
      setPhase("champion");
    } else if (phase === "champion") {
      clearSavedChampion();
      if (knockoutRound?.matches.length) {
        rewindKnockout(knockoutRound, knockoutRound.matches.length - 1);
      } else if (revivalGroups.length) {
        rewindRevival(revivalGroups.length - 1);
      } else if (groupStageGroups.length) {
        rewindGroup(groupStageGroups.length - 1);
      }
    } else if (phase === "knockout" && knockoutRound) {
      if (matchIndex > 0) {
        rewindKnockout(knockoutRound, matchIndex - 1);
      } else if (knockoutRound.number > 1) {
        const previousRound = roundFromHistory(knockoutRound.number - 1);
        if (previousRound?.matches.length) {
          rewindKnockout(previousRound, previousRound.matches.length - 1);
        }
      } else if (revivalGroups.length) {
        rewindRevival(revivalGroups.length - 1);
      } else if (groupStageGroups.length) {
        rewindGroup(groupStageGroups.length - 1);
      }
    } else if (phase === "revival") {
      if (revivalIndex > 0) {
        rewindRevival(revivalIndex - 1);
      } else if (groupStageGroups.length) {
        rewindGroup(groupStageGroups.length - 1);
      }
    } else if (phase === "group") {
      if (groupIndex > 0) {
        rewindGroup(groupIndex - 1);
      } else {
        setGroupPicks([]);
        setGroupQualified([]);
        setGroupEliminated([]);
        setHistory([]);
        setPhase("roster");
      }
    } else if (phase === "roster") {
      goHome();
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Android 的下载管理器会在点击事件结束后才读取 Blob。过早释放会导致
    // “无法写入存储卡”等错误，因此给系统足够时间接管文件。
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  function posterFile(blob: Blob) {
    return new File([blob], posterFileName(), { type: "image/png" });
  }

  function canSharePosterFile(file: File) {
    try {
      return (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      );
    } catch {
      return false;
    }
  }

  function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  function isQQBrowser() {
    return /\bQQ\//i.test(navigator.userAgent) || /MQQBrowser/i.test(navigator.userAgent);
  }

  async function blobToDataUrl(blob: Blob) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("data-url"));
      reader.readAsDataURL(blob);
    });
  }

  async function copyPosterToClipboard(blob: Blob) {
    if (
      typeof ClipboardItem === "undefined" ||
      typeof navigator.clipboard?.write !== "function"
    ) {
      return false;
    }

    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    } catch {
      return false;
    }
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

    const exportHost = document.createElement("div");
    exportHost.className = "poster-export-host";
    const exportPoster = poster.cloneNode(true) as HTMLElement;
    exportPoster.classList.remove("poster-source-layout");
    exportPoster.classList.add("poster-export-layout");
    exportHost.appendChild(exportPoster);
    document.body.appendChild(exportHost);

    try {
      const { toBlob } = await import("html-to-image");
      const posterHeight = POSTER_EXPORT_HEIGHT;
      const blob = await toBlob(exportPoster, {
        width: POSTER_EXPORT_WIDTH,
        height: posterHeight,
        canvasWidth: POSTER_EXPORT_WIDTH,
        canvasHeight: posterHeight,
        backgroundColor: "#0b0a12",
        cacheBust: true,
        pixelRatio: 1,
        style: {
          width: `${POSTER_EXPORT_WIDTH}px`,
          height: `${POSTER_EXPORT_HEIGHT}px`,
          minHeight: `${POSTER_EXPORT_HEIGHT}px`,
          maxWidth: "none",
          margin: "0",
          borderRadius: "0",
          overflow: "hidden",
        },
        imagePlaceholder:
          "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
      });
      if (!blob) throw new Error("image");
      return blob;
    } finally {
      exportHost.remove();
    }
  }

  function posterFileName() {
    const versionName = (selectedVersion?.abbr ?? "maimai")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    return `mai-CUP-${versionName || "maimai"}-result.png`;
  }

  async function savePosterImage() {
    if (exportBusyRef.current) return;
    exportBusyRef.current = true;
    setExportState("rendering");
    try {
      const blob = posterBlobRef.current ?? (await createPosterBlob());
      posterBlobRef.current = blob;
      const file = posterFile(blob);

      if (
        isMobileBrowser() &&
        (canSharePosterFile(file) ||
          (isQQBrowser() && typeof navigator.share === "function"))
      ) {
        await navigator.share({
          files: [file],
          title: `${selectedVersion?.title ?? "舞萌"} · mai:CUP 比赛一图流`,
        });
        setExportState("shared");
        return;
      }

      if (isQQBrowser()) {
        const copied = await copyPosterToClipboard(blob);
        setExportState(copied ? "copied" : "qq-help");
        return;
      }

      downloadPoster(blob, posterFileName());
      setExportState("saved");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setExportState("ready");
      } else if (
        posterBlobRef.current &&
        isQQBrowser() &&
        (await copyPosterToClipboard(posterBlobRef.current))
      ) {
        setExportState("copied");
      } else if (isQQBrowser()) {
        setExportState("qq-help");
      } else if (posterBlobRef.current) {
        // 部分安卓 WebView 虽然报告支持文件分享，但实际调用会失败。
        // 此时退回延迟释放的标准下载。
        downloadPoster(posterBlobRef.current, posterFileName());
        setExportState("fallback");
      } else {
        setExportState("error");
      }
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
      const file = posterFile(blob);
      const supportsFileShare = canSharePosterFile(file);

      if (supportsFileShare) {
        await navigator.share({
          files: [file],
          title: `${selectedVersion?.title ?? "舞萌"} · mai:CUP 比赛一图流`,
          text: "这是我的舞萌版本本命曲比赛结果。",
        });
        setExportState("shared");
      } else {
        if (isQQBrowser()) {
          const copied = await copyPosterToClipboard(blob);
          setExportState(copied ? "copied" : "qq-help");
        } else {
          downloadPoster(blob, posterFileName());
          setExportState("fallback");
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setExportState("ready");
      } else if (
        isQQBrowser() &&
        (await copyPosterToClipboard(blob))
      ) {
        setExportState("copied");
      } else if (isQQBrowser()) {
        setExportState("qq-help");
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
      if (posterPreviewUrlRef.current) {
        URL.revokeObjectURL(posterPreviewUrlRef.current);
        posterPreviewUrlRef.current = null;
      }
      setPosterPreviewUrl(null);
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
        if (posterPreviewUrlRef.current) {
          URL.revokeObjectURL(posterPreviewUrlRef.current);
        }
        // QQ 内置浏览器无法把 blob: 图片交给下载管理器。Data URL 会让
        // 长按菜单直接面对真实 PNG 数据，而不是一个仅当前页面可见的临时地址。
        const previewUrl = await blobToDataUrl(blob);
        posterPreviewUrlRef.current = previewUrl;
        setPosterPreviewUrl(previewUrl);
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

  useEffect(
    () => () => {
      if (posterPreviewUrlRef.current) {
        URL.revokeObjectURL(posterPreviewUrlRef.current);
      }
    },
    [],
  );

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
                <button
                  className="cover-preview-button"
                  type="button"
                  disabled={previewUnavailable}
                  onClick={() => togglePreview(song)}
                  aria-label={
                    previewUnavailable
                      ? `${song.title} 暂无试听`
                      : isPlaying
                        ? `停止试听 ${song.title}`
                        : `试听 ${song.title}`
                  }
                  title={
                    previewUnavailable
                      ? "暂无试听"
                      : isPlaying
                        ? `停止试听 · ${previewSeconds}s`
                        : "立即试听"
                  }
                >
                  <span className="preview-triangle" aria-hidden="true" />
                </button>
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

  function renderPosterBracketSide(side: "left" | "right") {
    const columns = posterRouteStages
      .map((stage) => {
        const midpoint = Math.ceil(stage.winners.length / 2);
        return {
          label: stage.label,
          songs:
            side === "left"
              ? stage.winners.slice(0, midpoint)
              : stage.winners.slice(midpoint),
        };
      })
      .filter((column) => column.songs.length);
    const orderedColumns =
      side === "left" ? columns : [...columns].reverse();

    return (
      <div className={`poster-bracket-tree poster-bracket-tree-${side}`}>
        {orderedColumns.map((column, columnIndex) => (
          <section
            className="poster-bracket-column"
            key={`${side}-${column.label}`}
          >
            <small>{column.label}</small>
            <div>
              {column.songs.map((song) => (
                <article
                  className={`poster-route-song${
                    song.id === champion?.id ? " is-champion-route" : ""
                  }`}
                  key={song.id}
                >
                  <img src={song.cover} alt="" />
                  <strong>{song.title}</strong>
                  <i>{columnIndex + 1}</i>
                </article>
              ))}
            </div>
          </section>
        ))}
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
          <button
            className="icon-button"
            onClick={goToPreviousStage}
            aria-label="返回上一阶段"
          >
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
          <button
            className="icon-button"
            onClick={goToPreviousStage}
            aria-label="返回上一阶段"
          >
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
        <main className="overview-page overview-fit-page">
          <header className="overview-header">
            <button
              className="icon-button"
              onClick={goToPreviousStage}
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
                ? "正在生成固定版式海报，歌曲较多时需要稍等片刻…"
                : exportState === "ready"
                  ? "1080px淘汰树海报已经生成，可以保存PNG或直接分享。"
                : exportState === "saved"
                  ? "一图流PNG已保存。"
                  : exportState === "shared"
                    ? "系统图片面板已完成操作；可选择保存到相册、文件或分享。"
                    : exportState === "copied"
                      ? "图片已复制，可粘贴到QQ聊天后再保存到相册。"
                      : exportState === "qq-help"
                        ? "QQ内置浏览器限制了文件写入；请点右上角菜单，选择“浏览器打开”后保存。"
                    : exportState === "fallback"
                      ? "已改用浏览器下载；若手机仍拦截，请长按下方预览图保存。"
                      : "图片生成失败，请确认歌曲封面加载完成后重试。"}
            </p>
          )}
          <section className="overview-screen" aria-label="比赛概览预览">
            {posterPreviewUrl ? (
              <img
                className="overview-preview-image"
                src={posterPreviewUrl}
                alt={`${selectedVersion.title} 比赛一图流完整概览`}
              />
            ) : (
              <div className="overview-preview-loading" aria-live="polite">
                <span className="brand-disc">
                  <i />
                </span>
                <strong>
                  {exportState === "error" ? "概览生成失败" : "正在排版完整概览…"}
                </strong>
                <small>
                  {exportState === "error"
                    ? "请返回冠军页后重新进入概览"
                    : "歌曲较多时需要稍等片刻"}
                </small>
              </div>
            )}
            <p className="overview-preview-hint">
              1080px 清晰图 · QQ内请优先点保存或分享
            </p>
          </section>
          <article
            className="tournament-poster poster-cup-layout poster-source-layout"
            ref={posterRef}
            aria-hidden="true"
          >
            <header className="poster-cup-header">
              <div className="poster-brand">
                <span className="brand-disc">
                  <i />
                </span>
                <div>
                  <strong>mai:CUP</strong>
                  <small>MAIMAI CHINA FAVORITE TOURNAMENT</small>
                </div>
              </div>
              <span>TOURNAMENT OVERVIEW · 完整比赛概览</span>
              <h1>{selectedVersion.title} · 歌曲世界杯</h1>
              <div className="poster-cup-summary">
                <span>
                  <strong>{entrants.length}</strong> 首参赛
                </span>
                <i />
                <span>
                  <strong>{groupStageGroups.length}</strong> 个小组
                </span>
                <i />
                <span>
                  <strong>{posterSummary.revivalMatches}</strong> 首复活
                </span>
                <i />
                <span>
                  <strong>{posterSummary.knockoutMatches}</strong> 场淘汰
                </span>
              </div>
            </header>

            <section className="poster-cup-bracket">
              <span className="poster-bracket-caption poster-bracket-caption-left">
                ROAD TO FINAL · 左半区
              </span>
              <span className="poster-bracket-caption poster-bracket-caption-right">
                右半区 · ROAD TO FINAL
              </span>
              {renderPosterBracketSide("left")}
              <div className="poster-cup-champion">
                <span className="poster-cup-crown">♛</span>
                <img src={champion.cover} alt="" />
                <strong>🏆 冠军 · CHAMPION</strong>
                <h2>{champion.title}</h2>
                <p>{champion.artist}</p>
                <small>
                  {champion.genre} · {champion.bpm} BPM
                </small>
              </div>
              {renderPosterBracketSide("right")}
            </section>

            <section className="poster-cup-journey">
              <div>
                <small>GROUP STAGE</small>
                <strong>{posterSummary.groupMatches} 组小组赛</strong>
                <span>每组选择两首晋级</span>
              </div>
              <b>→</b>
              <div>
                <small>REVIVAL</small>
                <strong>{posterSummary.revivalMatches} 首淘汰复活</strong>
                <span>三分之一名额向上取整</span>
              </div>
              <b>→</b>
              <div>
                <small>KNOCKOUT</small>
                <strong>{posterSummary.knockoutMatches} 场一对一</strong>
                <span>八强 · 四强 · 总决赛</span>
              </div>
              <b>→</b>
              <div className="is-final">
                <small>WINNER</small>
                <strong>{champion.title}</strong>
                <span>最终冠军</span>
              </div>
            </section>

            <footer className="poster-cup-footer">
              <div className="poster-footer-qr">
                <img
                  src={assetPath(SITE_QR_IMAGE)}
                  alt="mai:CUP 网站主页二维码"
                />
                <div>
                  <strong>扫码开始你的本命曲世界杯</strong>
                  <span>{PUBLIC_SITE_URL.replace("https://", "")}</span>
                </div>
              </div>
              <div className="poster-brand">
                <span className="brand-disc">
                  <i />
                </span>
                <div>
                  <strong>mai:CUP</strong>
                  <small>为你的本命曲办一场世界杯</small>
                </div>
              </div>
              <p className="poster-footer-description">
                <span>舞萌中国版曲库 · 30秒歌曲试听</span>
                <span>小组赛、复活赛到总决赛的一图流淘汰赛</span>
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
        <button className="champion-back" onClick={goToPreviousStage}>
          ← 返回上一阶段
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
            <img src={assetPath(featuredVersion.icon)} alt="" />
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
                  <img src={assetPath(version.icon)} alt="" />
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

      <footer className="site-footer">
        <div className="site-footer-heading">
          <a className="brand" href="#top">
            <span className="brand-disc">
              <i />
            </span>
            <span>
              <strong>mai:CUP</strong>
              <small>CHINA VERSION</small>
            </span>
          </a>
          <div>
            <span className="eyebrow">SOURCES & CREDITS</span>
            <h2>来源与鸣谢</h2>
            <p>
              本站为非官方同人项目。投票进度自动保存在当前浏览器中，关闭网页后再次打开可继续比赛。
            </p>
          </div>
        </div>
        <div className="credit-grid">
          <a href={PREVIEW_SOURCE_URL} target="_blank" rel="noreferrer">
            <small>试听乐曲来源</small>
            <strong>网易云音乐电台</strong>
            <span>{PREVIEW_SOURCE_URL.replace("https://", "")}</span>
          </a>
          <a href={INSPIRATION_URL} target="_blank" rel="noreferrer">
            <small>灵感与界面参考</small>
            <strong>Music Cup</strong>
            <span>musiccup.app/?lang=hans</span>
          </a>
          <a href={CATALOG_SOURCE_URL} target="_blank" rel="noreferrer">
            <small>舞萌曲库来源</small>
            <strong>Arcade Songs</strong>
            <span>arcade-songs.zetaraku.dev/maimai/</span>
          </a>
        </div>
        <p className="site-disclaimer">
          歌曲、封面、版本标识及相关作品版权归原作者与权利方所有；宴谱面已从参赛曲目中排除，试听片段最长播放30秒。
        </p>
      </footer>
    </main>
  );
}
