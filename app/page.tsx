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

type BattleRound = {
  number: number;
  participantCount: number;
  groups: Song[][];
  automaticWinners: Song[];
};

const RESULTS_KEY = "mai-cup-results-v3";
const palette = ["cyan", "lime", "pink", "violet", "orange"];

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function buildRound(participants: Song[], number: number): BattleRound {
  const mixed = shuffle(participants);
  const groups: Song[][] = [];
  const automaticWinners: Song[] = [];

  for (let index = 0; index < mixed.length; index += 4) {
    const group = mixed.slice(index, index + 4);
    if (group.length === 1) automaticWinners.push(group[0]);
    else groups.push(group);
  }

  return {
    number,
    participantCount: participants.length,
    groups,
    automaticWinners,
  };
}

function estimatedChoices(songCount: number) {
  let participants = songCount;
  let choices = 0;
  while (participants > 1) {
    const completeGroups = Math.floor(participants / 4);
    const remainder = participants % 4;
    choices += completeGroups + (remainder > 1 ? 1 : 0);
    participants = completeGroups + (remainder ? 1 : 0);
  }
  return choices;
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
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [phase, setPhase] = useState<"home" | "battle" | "champion">("home");
  const [round, setRound] = useState<BattleRound | null>(null);
  const [groupIndex, setGroupIndex] = useState(0);
  const [roundWinners, setRoundWinners] = useState<Song[]>([]);
  const [champion, setChampion] = useState<Song | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, true>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, true>>({});
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [previewSeconds, setPreviewSeconds] = useState(30);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      // 本地存储不可用时仍可继续完成当前决战。
    }
  }, []);

  const stopPreview = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // 音频尚未载入时无需重置进度。
      }
    }
    setPlayingSongId(null);
    setPreviewSeconds(30);
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
      audio.preload = "none";
      audio.volume = 0.8;
      audio.src = song.preview;
      audio.currentTime = 0;
      audio.ontimeupdate = () => {
        if (audio.currentTime >= 30) {
          stopPreview();
          return;
        }
        setPreviewSeconds(Math.max(0, 30 - Math.floor(audio.currentTime)));
      };
      audio.onended = stopPreview;
      audio.onerror = () => {
        setPreviewErrors((current) => ({ ...current, [song.id]: true }));
        stopPreview();
      };

      setPlayingSongId(song.id);
      setPreviewSeconds(30);
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

  const currentGroup = round?.groups[groupIndex] ?? [];
  const totalGroups = round?.groups.length ?? 0;

  useEffect(() => {
    if (
      playingSongId &&
      !currentGroup.some((song) => song.id === playingSongId)
    ) {
      stopPreview();
    }
  }, [currentGroup, playingSongId, stopPreview]);

  const beginRound = useCallback((participants: Song[], number: number) => {
    if (participants.length === 1) {
      setChampion(participants[0]);
      setPhase("champion");
      return;
    }
    const nextRound = buildRound(participants, number);
    setRound(nextRound);
    setRoundWinners([...nextRound.automaticWinners]);
    setGroupIndex(0);
  }, []);

  const startBattle = useCallback(
    (version: Version) => {
      if (!catalog) return;
      const participants = catalog.songs.filter(
        (song) => song.version === version.version,
      );
      if (!participants.length) return;
      stopPreview();
      setSelectedVersion(version);
      setChampion(null);
      setPhase("battle");
      beginRound(participants, 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [beginRound, catalog, stopPreview],
  );

  const chooseSong = useCallback(
    (song: Song) => {
      if (!round || !selectedVersion) return;
      stopPreview();
      const winners = [...roundWinners, song];
      const isLastGroup = groupIndex === round.groups.length - 1;

      if (!isLastGroup) {
        setRoundWinners(winners);
        setGroupIndex((current) => current + 1);
        return;
      }

      if (winners.length === 1) {
        const record: WinnerRecord = {
          song: winners[0],
          versionTitle: selectedVersion.title,
          decidedAt: new Date().toISOString(),
        };
        const nextResults = {
          ...results,
          [selectedVersion.version]: record,
        };
        setResults(nextResults);
        setChampion(winners[0]);
        setPhase("champion");
        try {
          window.localStorage.setItem(RESULTS_KEY, JSON.stringify(nextResults));
        } catch {
          // 结果仍会保留至本次会话结束。
        }
      } else {
        beginRound(winners, round.number + 1);
      }
    },
    [
      beginRound,
      groupIndex,
      results,
      round,
      roundWinners,
      selectedVersion,
      stopPreview,
    ],
  );

  useEffect(() => {
    if (phase !== "battle") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      if (index >= 0 && index < currentGroup.length) {
        chooseSong(currentGroup[index]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chooseSong, currentGroup, phase]);

  const goHome = () => {
    stopPreview();
    setPhase("home");
    setRound(null);
    setSelectedVersion(null);
    setChampion(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reportImageError = (id: string) => {
    setImageErrors((current) => ({ ...current, [id]: true }));
  };

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
        <p>正在装载舞萌中国版曲库…</p>
      </main>
    );
  }

  if (phase === "battle" && selectedVersion && round) {
    const roundProgress =
      totalGroups === 0 ? 100 : ((groupIndex + 1) / totalGroups) * 100;
    return (
      <main className="battle-page">
        <header className="battle-header">
          <button
            className="icon-button"
            onClick={goHome}
            aria-label="返回版本选择"
          >
            ←
          </button>
          <div className="battle-heading">
            <strong>{selectedVersion.title}</strong>
            <span>
              ROUND {String(round.number).padStart(2, "0")} ·{" "}
              {round.participantCount} 首在场
            </span>
          </div>
          <button
            className="text-button"
            onClick={() => startBattle(selectedVersion)}
          >
            重新洗牌
          </button>
        </header>

        <section className="battle-stage">
          <div className="round-meta">
            <span className="eyebrow">LISTEN · COMPARE · PICK</span>
            <h1>
              先听一段，再选<span>晋级</span>。
            </h1>
            <p>每首最多试听 30 秒；选择后，胜者进入下一轮。</p>
          </div>

          <div className="progress-row">
            <span>
              本轮第 {groupIndex + 1} / {totalGroups} 组
            </span>
            <span>{Math.round(roundProgress)}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${roundProgress}%` }} />
          </div>

          <div className={`song-grid song-count-${currentGroup.length}`}>
            {currentGroup.map((song, index) => {
              const isPlaying = playingSongId === song.id;
              const previewUnavailable =
                !song.preview || previewErrors[song.id];
              return (
                <article
                  className={`song-card tone-${songTone(song, index)} ${
                    isPlaying ? "is-playing" : ""
                  }`}
                  key={song.id}
                >
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
                      aria-label={
                        previewUnavailable
                          ? `${song.title} 暂无试听`
                          : isPlaying
                            ? `停止试听 ${song.title}`
                            : `试听 ${song.title} 30 秒`
                      }
                    >
                      <span aria-hidden="true">{isPlaying ? "■" : "▶"}</span>
                      {previewUnavailable
                        ? "暂无试听"
                        : isPlaying
                          ? `停止 · ${previewSeconds}s`
                          : "试听 30s"}
                    </button>
                    <button
                      className="pick-label"
                      type="button"
                      onClick={() => chooseSong(song)}
                      aria-label={`选择 ${song.title}，${song.artist}`}
                    >
                      选它晋级 <span>→</span>
                    </button>
                  </span>
                </article>
              );
            })}
          </div>

          <p className="keyboard-hint">
            键盘玩家可按 <kbd>1</kbd> – <kbd>{currentGroup.length}</kbd>{" "}
            快速选择；试听源来自网易云电台
          </p>
        </section>
      </main>
    );
  }

  if (phase === "champion" && selectedVersion && champion) {
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
          <span className="champion-kicker">VERSION CHAMPION</span>
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
            <span>{songCounts.get(selectedVersion.version)} 首中胜出</span>
          </div>
          <div className="champion-actions">
            <button
              className="primary-button"
              onClick={() => startBattle(selectedVersion)}
            >
              再战一轮
            </button>
            <button className="secondary-button" onClick={goHome}>
              挑战其他版本
            </button>
          </div>
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
            每个时代，
            <br />
            只有<span>一首</span>能登顶。
          </h1>
          <p>
            DX 段采用中国版年度序列：舞萌 DX、2021…2026。
            <br />
            每轮可以先试听 30 秒，再决定让谁晋级。
          </p>
          <div className="hero-stats">
            <span>
              <strong>{catalog.songs.length}</strong>
              中国版曲目
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
            {featuredSongs} 首参赛 · 预计 {estimatedChoices(featuredSongs)}{" "}
            次选择
          </p>
          <button
            className="primary-button"
            onClick={() => startBattle(featuredVersion)}
          >
            立即开启 <span>→</span>
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
              aria-label="搜索版本"
            />
          </label>
        </div>

        <div className="filter-tabs" role="group" aria-label="版本筛选">
          {[
            ["all", "全部版本"],
            ["dx", "舞萌 DX 中国版"],
            ["classic", "经典旧框"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value as typeof filter)}
              aria-pressed={filter === value}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="version-grid">
          {visibleVersions.map((version, index) => {
            const count = songCounts.get(version.version) ?? 0;
            const result = results[version.version];
            return (
              <article
                className={`version-card accent-${palette[index % palette.length]} ${
                  result ? "completed" : ""
                }`}
                key={version.version}
              >
                <div className="version-card-top">
                  <span>
                    {version.era === "dx" ? "CHINA DX" : "CLASSIC"}
                  </span>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div
                  className={`version-art version-art-${version.era}`}
                  aria-hidden="true"
                >
                  <img src={version.icon} alt="" loading="lazy" />
                </div>
                <h3>{version.title}</h3>
                <p>
                  {count} 首参赛 · 约 {estimatedChoices(count)} 次选择
                </p>
                {result ? (
                  <div className="version-winner">
                    <span>你的冠军</span>
                    <strong>{result.song.title}</strong>
                  </div>
                ) : (
                  <div className="version-winner empty">
                    <span>等待开启</span>
                    <strong>尚未决出冠军</strong>
                  </div>
                )}
                <button onClick={() => startBattle(version)}>
                  {result ? "重新决战" : "开始决战"} <span>→</span>
                </button>
              </article>
            );
          })}
        </div>

        {!visibleVersions.length && (
          <div className="empty-search">没有找到匹配的版本。</div>
        )}
      </section>

      <section className="how-section">
        <div>
          <span className="eyebrow">HOW IT WORKS</span>
          <h2>按中国版曲库，选出真正的版本冠军</h2>
        </div>
        <ol>
          <li>
            <span>01</span>
            <strong>按国服年度版本分组</strong>
            <p>曲目使用 LXNS 的中国版主版本归属，DX 段截至 2026。</p>
          </li>
          <li>
            <span>02</span>
            <strong>试听 30 秒再决定</strong>
            <p>投票卡片提供网易云电台试听，同一时间只播放一首。</p>
          </li>
          <li>
            <span>03</span>
            <strong>每组只留一首</strong>
            <p>胜者继续交锋，最终留下该版本最喜欢的一首。</p>
          </li>
        </ol>
      </section>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-disc">
            <i />
          </span>
          <span>
            <strong>mai:CUP</strong>
            <small>NO RATING. JUST FAVORITES.</small>
          </span>
        </div>
        <p>
          中国版曲库、版本与曲绘来自{" "}
          <a
            href="https://maimai.lxns.net/docs/api/maimai"
            target="_blank"
            rel="noreferrer"
          >
            LXNS
          </a>
          ；30 秒试听来自用户指定的{" "}
          <a href={catalog.previewSource} target="_blank" rel="noreferrer">
            网易云音乐电台
          </a>
          。旧框头像参考 Maimai Wiki，中国版年度 Logo 来自公开社区素材。非世嘉官方产品。
        </p>
      </footer>
    </main>
  );
}
