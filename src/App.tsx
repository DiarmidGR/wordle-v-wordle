
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const ANSWER = "CRANE";

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

function evaluateGuess(guess: string, answer: string): TileStatus[] {
  const result: TileStatus[] = Array(WORD_LENGTH).fill("absent");
  const remaining = answer.split("");

  // First pass: identify letters in the correct position.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
      remaining[i] = "";
    }
  }

  // Second pass: identify letters in the wrong position.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;

    const index = remaining.indexOf(guess[i]);

    if (index !== -1) {
      result[i] = "present";
      remaining[index] = "";
    }
  }

  return result;
}

function App() {
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing");
  const [message, setMessage] = useState("");

  const handleKey = useCallback(
    (key: string) => {
      if (gameStatus !== "playing") return;

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

        const statuses = evaluateGuess(currentGuess, ANSWER);
        const nextGuesses = [
          ...guesses,
          { word: currentGuess, statuses },
        ];

        setGuesses(nextGuesses);
        setCurrentGuess("");
        setMessage("");

        if (currentGuess === ANSWER) {
          setGameStatus("won");
          setMessage("Excellent!");
        } else if (nextGuesses.length === MAX_GUESSES) {
          setGameStatus("lost");
          setMessage(`The word was ${ANSWER}`);
        }

        return;
      }

      if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
        setCurrentGuess((guess) => guess + key);
        setMessage("");
      }
    },
    [currentGuess, gameStatus, guesses],
  );

  // Support the physical keyboard as well as the on-screen keyboard.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

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

  function restartGame() {
    setGuesses([]);
    setCurrentGuess("");
    setGameStatus("playing");
    setMessage("");
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
      <header className="topbar">
        <h1>Wordle v Wordle</h1>
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
