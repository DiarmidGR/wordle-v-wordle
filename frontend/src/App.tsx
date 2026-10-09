
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { SkewLoader } from "react-spinners";
import "./App.css";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const API_BASE = "/api";

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
];

type TileStatus = "correct" | "present" | "absent" | "empty";
type GameStatus = "playing" | "won" | "lost";

type Guess = {
  word: string;
  statuses: TileStatus[];
};

type GameState = {
  code: string;
  playerId: string;
  role: "host" | "guest";
  players: number;
  maxPlayers: number;
  guesses: Guess[];
  guessesRemaining: number;
  status: GameStatus;
  answer?: string;
};

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);
  const result = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(result.error || "The request could not be completed");
  }

  return result;
}

function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [currentGuess, setCurrentGuess] = useState("");
  const [dialogMode, setDialogMode] = useState<"menu" | "join">("menu");
  const [joinCode, setJoinCode] = useState("");
  const [dialogMessage, setDialogMessage] = useState("");
  const [message, setMessage] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const guesses = game?.guesses ?? [];
  const gameStatus = game?.status ?? "playing";
  const gameCode = game?.code;
  const playerId = game?.playerId;
  const players = game?.players;
  const maxPlayers = game?.maxPlayers;

  async function hostGame() {
    setIsConnecting(true);
    setDialogMessage("");

    try {
      const newGame = await apiRequest<GameState>("/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setGame(newGame);
      setCurrentGuess("");
      setMessage("");
    } catch (error) {
      setDialogMessage(error instanceof Error ? error.message : "Could not host a game");
    } finally {
      setIsConnecting(false);
    }
  }

  async function joinGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim();

    if (!/^\d{4}$/.test(code)) {
      setDialogMessage("Enter a four-digit room code");
      return;
    }

    setIsConnecting(true);
    setDialogMessage("");

    try {
      const joinedGame = await apiRequest<GameState>(`/games/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setGame(joinedGame);
      setCurrentGuess("");
      setMessage("");
    } catch (error) {
      setDialogMessage(error instanceof Error ? error.message : "Could not join that game");
    } finally {
      setIsConnecting(false);
    }
  }

  const handleKey = useCallback(
    (key: string) => {
      if (!game || game.status !== "playing" || isSubmittingGuess) return;

      if (key === "BACKSPACE" || key === "BACKSPACE_ICON") {
        setCurrentGuess((guess) => guess.slice(0, -1));
        setMessage("");
        return;
      }

      if (key === "ENTER") {
        if (currentGuess.length !== WORD_LENGTH) {
          setMessage("Not enough letters");
          return;
        }

        setIsSubmittingGuess(true);
        apiRequest<GameState>(`/games/${game.code}/guesses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: game.playerId, guess: currentGuess }),
        })
          .then((updatedGame) => {
            setGame(updatedGame);
            setCurrentGuess("");
            setMessage(
              updatedGame.status === "won"
                ? "Excellent!"
                : updatedGame.status === "lost"
                  ? `The word was ${updatedGame.answer}`
                  : "",
            );
          })
          .catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : "Could not submit guess");
          })
          .finally(() => setIsSubmittingGuess(false));

        return;
      }

      if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
        setCurrentGuess((guess) => guess + key);
        setMessage("");
      }
    },
    [currentGuess, game, isSubmittingGuess],
  );

  // Support the physical keyboard as well as the on-screen keyboard.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement) return;

      if (event.key === "Enter") {
        event.preventDefault();
        handleKey("ENTER");
      } else if (event.key === "Backspace") {
        event.preventDefault();
        handleKey("BACKSPACE");
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        handleKey(event.key.toUpperCase());
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  useEffect(() => {
    if (!gameCode || !playerId || players === undefined || maxPlayers === undefined) return;
    if (players >= maxPlayers) return;

    let cancelled = false;
    const refreshGame = async () => {
      try {
        const latestGame = await apiRequest<GameState>(
          `/games/${gameCode}?playerId=${encodeURIComponent(playerId)}`,
        );
        if (!cancelled) setGame(latestGame);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not refresh game");
        }
      }
    };

    const interval = window.setInterval(refreshGame, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [gameCode, playerId, players, maxPlayers]);

  async function restartGame() {
    if (!game) return;

    try {
      const restartedGame = await apiRequest<GameState>(`/games/${game.code}/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: game.playerId }),
      });
      setGame(restartedGame);
      setCurrentGuess("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not restart game");
    }
  }

  // Keep the most informative status for each keyboard letter.
  const keyboardStatuses: Record<string, TileStatus> = {};

  guesses.forEach(({ word, statuses }) => {
    word.split("").forEach((letter, index) => {
      const status = statuses[index];
      const previous = keyboardStatuses[letter];

      const priority: Record<TileStatus, number> = {
        empty: 0,
        absent: 1,
        present: 2,
        correct: 3,
      };

      if (!previous || priority[status] > priority[previous]) {
        keyboardStatuses[letter] = status;
      }
    });
  });

  return (
    <main className="wordle-app">
      {!game && <div className="start-overlay">
        <section
          className="start-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-dialog-title"
        >
          <p className="dialog-eyebrow">WORDLE V WORDLE</p>
          {dialogMode === "menu" ? (
            <>
              <h2 id="start-dialog-title">How would you like to play?</h2>
              <div className="dialog-actions">
                <button
                  className="dialog-button dialog-button-primary"
                  type="button"
                  onClick={() => {
                    setDialogMode("join");
                    setDialogMessage("");
                  }}
                >
                  Join a game
                </button>
                <button
                  className="dialog-button"
                  type="button"
                  onClick={hostGame}
                  disabled={isConnecting}
                >
                  {isConnecting ? "Creating room..." : "Host a game"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="start-dialog-title">Join a game</h2>
              <form className="join-form" onSubmit={joinGame}>
                <label htmlFor="join-code">Four-digit room code</label>
                <input
                  id="join-code"
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="0000"
                  value={joinCode}
                  onChange={(event) => {
                    setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4));
                    setDialogMessage("");
                  }}
                />
                <div className="dialog-actions">
                  <button
                    className="dialog-button dialog-button-primary"
                    type="submit"
                    disabled={isConnecting}
                  >
                    {isConnecting ? "Joining..." : "Join room"}
                  </button>
                  <button
                    className="dialog-button"
                    type="button"
                    onClick={() => {
                      setDialogMode("menu");
                      setDialogMessage("");
                    }}
                    disabled={isConnecting}
                  >
                    Back
                  </button>
                </div>
              </form>
            </>
          )}
          {dialogMessage && <p className="dialog-error" role="alert">{dialogMessage}</p>}
        </section>
      </div>}

      <header className="topbar">
        <h1>Wordle v Wordle</h1>
        {game && (
          <div className="room-status" aria-live="polite">
            
            <span>ROOM {game.code}</span>
            <span>{game.players < game.maxPlayers ? "Waiting for player" : "2 players"}</span>
            {game.players < game.maxPlayers && <SkewLoader color="#68a261" size = {9} />}
          </div>
        )}
      </header>

      <section className="game-area" aria-label="Word guessing game">
        <div className="game-board" role="group" aria-label="Guess board">
          {Array.from({ length: MAX_GUESSES }, (_, rowIndex) => {
            const submittedGuess = guesses[rowIndex];
            const activeRow = rowIndex === guesses.length && gameStatus === "playing";

            return Array.from({ length: WORD_LENGTH }, (_, colIndex) => {
              const letter = submittedGuess
                ? submittedGuess.word[colIndex]
                : activeRow
                  ? currentGuess[colIndex] ?? ""
                  : "";

              const status = submittedGuess
                ? submittedGuess.statuses[colIndex]
                : "empty";

              const isRevealed = Boolean(submittedGuess);

              return (
                <div
                  className={[
                    "tile",
                    letter ? "tile-filled" : "",
                    isRevealed ? `tile-${status}` : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={`${rowIndex}-${colIndex}`}
                  aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}${letter ? `, ${letter}` : ""}`}
                >
                  {letter}
                </div>
              );
            });
          })}
        </div>

        <div className="game-message" aria-live="polite">
          {message && (
            <span className="message-text">
              {message}
              {gameStatus !== "playing" && (
                <button className="play-again" onClick={restartGame} type="button">
                  Play again
                </button>
              )}
            </span>
          )}
        </div>

        <div className="keyboard" aria-label="On-screen keyboard">
          {KEY_ROWS.map((row, rowIndex) => (
            <div className="keyboard-row" key={rowIndex}>
              {row.map((key) => {
                const status = keyboardStatuses[key];
                const isSpecial = key === "ENTER" || key === "BACKSPACE";

                return (
                  <button
                    className={[
                      "key",
                      isSpecial ? "key-special" : "",
                      status ? `key-${status}` : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={key}
                    type="button"
                    aria-label={key === "BACKSPACE" ? "Backspace" : key}
                    onClick={() => handleKey(key)}
                  >
                    {key === "BACKSPACE" ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="backspace-icon"
                        aria-hidden="true"
                      >
                        <path
                          d="M9 4H21V20H9L2 12L9 4Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 9L18 15M18 9L12 15"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                      </svg>
                    ) : key === "ENTER" ? (
                      "ENTER"
                    ) : (
                      key
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>©2026 Diarmid Rendell</span>
      </footer>
    </main>
  );
}

export default App;
