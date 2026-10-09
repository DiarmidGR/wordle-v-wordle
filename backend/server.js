const express = require("express");
const { randomUUID } = require("node:crypto");

const app = express();
const PORT = process.env.PORT || 3001;
const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const ANSWER = "CRANE";
const games = new Map();

app.use(express.json());
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		return res.sendStatus(204);
	}

	next();
});

function createPlayer() {
	return {
		id: randomUUID(),
		guesses: [],
		status: "playing",
	};
}

function generateCode() {
	let code;

	do {
		code = String(Math.floor(1000 + Math.random() * 9000));
	} while (games.has(code));

	return code;
}

function evaluateGuess(guess) {
	const statuses = Array(WORD_LENGTH).fill("absent");
	const remaining = ANSWER.split("");

	for (let index = 0; index < WORD_LENGTH; index += 1) {
		if (guess[index] === ANSWER[index]) {
			statuses[index] = "correct";
			remaining[index] = "";
		}
	}

	for (let index = 0; index < WORD_LENGTH; index += 1) {
		if (statuses[index] === "correct") continue;

		const answerIndex = remaining.indexOf(guess[index]);

		if (answerIndex !== -1) {
			statuses[index] = "present";
			remaining[answerIndex] = "";
		}
	}

	return statuses;
}

function getGameState(game, player) {
	const state = {
		code: game.code,
		playerId: player.id,
		role: player.role,
		players: game.players.length,
		maxPlayers: 2,
		guesses: player.guesses,
		guessesRemaining: MAX_GUESSES - player.guesses.length,
		status: player.status,
	};

	if (player.status === "lost") {
		state.answer = ANSWER;
	}

	return state;
}

function findPlayer(game, playerId) {
	return game.players.find((player) => player.id === playerId);
}

function findGame(req, res) {
	const code = String(req.params.code || "").trim();
	const game = games.get(code);

	if (!game) {
		res.status(404).json({ error: "Game not found" });
		return null;
	}

	return game;
}

app.get("/api/health", (req, res) => {
	res.json({ status: "ok" });
});

app.post("/api/games", (req, res) => {
	const code = generateCode();
	const host = { ...createPlayer(), role: "host" };
	const game = { code, players: [host] };

	games.set(code, game);
	res.status(201).json(getGameState(game, host));
});

app.post("/api/games/:code/join", (req, res) => {
	const game = findGame(req, res);
	if (!game) return;

	if (game.players.length >= 2) {
		return res.status(409).json({ error: "Game is full" });
	}

	const guest = { ...createPlayer(), role: "guest" };
	game.players.push(guest);
	return res.status(201).json(getGameState(game, guest));
});

app.get("/api/games/:code", (req, res) => {
	const game = findGame(req, res);
	if (!game) return;

	const player = findPlayer(game, req.query.playerId);
	if (!player) {
		return res.status(404).json({ error: "Player not found in this game" });
	}

	return res.json(getGameState(game, player));
});

app.post("/api/games/:code/guesses", (req, res) => {
	const game = findGame(req, res);
	if (!game) return;

	const player = findPlayer(game, req.body.playerId);
	if (!player) {
		return res.status(404).json({ error: "Player not found in this game" });
	}

	if (player.status !== "playing") {
		return res.status(409).json({ error: "This game is already over" });
	}

	const guess = typeof req.body.guess === "string" ? req.body.guess.toUpperCase() : "";
	if (!/^[A-Z]{5}$/.test(guess)) {
		return res.status(400).json({ error: "Guess must be exactly five letters" });
	}

	const statuses = evaluateGuess(guess);
	player.guesses.push({ word: guess, statuses });

	if (guess === ANSWER) {
		player.status = "won";
	} else if (player.guesses.length === MAX_GUESSES) {
		player.status = "lost";
	}

	return res.json(getGameState(game, player));
});

app.post("/api/games/:code/restart", (req, res) => {
	const game = findGame(req, res);
	if (!game) return;

	const player = findPlayer(game, req.body.playerId);
	if (!player) {
		return res.status(404).json({ error: "Player not found in this game" });
	}

	player.guesses = [];
	player.status = "playing";
	return res.json(getGameState(game, player));
});

app.use((error, req, res, next) => {
	if (error instanceof SyntaxError && "body" in error) {
		return res.status(400).json({ error: "Request body must be valid JSON" });
	}

	console.error(error);
	return res.status(500).json({ error: "Internal server error" });
});

if (require.main === module) {
	app.listen(PORT, () => {
		console.log(`Wordle backend listening on port ${PORT}`);
	});
}

module.exports = app;
