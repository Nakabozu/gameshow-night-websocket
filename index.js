import express from "express";
import http from "http";
import { Server } from "socket.io";

import cors from "cors";

const PORT = process.env.PORT || 3675;
const app = express();
app.use(cors());

const server = http.createServer(app);

console.log("Starting Express Server");
let lastGameId = 0;
/** @type {GameType[]} */
let games = [];
//
// TODO: DELETE THESE AFTER I REMOVE ALL REFERENCES TO THEM
//
/** @type {PlayerType[]} */
let players = [];
let buzzCount = 1;

/**
 * Gets the index of the player's game given the array of games and the player's
 * socket id
 * @param {GameType[]} games The array of all games
 * @param {string} playerId The socketId of the player to search for
 * @returns {{game: GameType, gameIndex: number, playerIndex: number}} -1 if the
 * player wasn't found, otherwise the index of the player's game in the games array
 */
const getPlayersGameData = (games, playerId) => {
    let playerIndex = -1;
    const gameIndex = games.findIndex((g) =>
        g.players.some((p, pi) => {
            if (p.socketId === playerId) {
                playerIndex = pi;
                return true;
            }
        })
    );
    return { game: games?.[gameIndex], gameIndex, playerIndex };
};

const io = new Server(server, {
    handlePreflightRequest: (req, res) => {
        const headers = {
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Origin": req.headers.origin, //or the specific origin
            // you want to give access to,
            "Access-Control-Allow-Credentials": true,
        };
        res.writeHead(200, headers);
        res.end();
    },
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

io.on("connection", (socket) => {
    try {
        console.log(`User Connected: ${socket.id}\x1b[00m`);
        //#endregion
        //#region Get/Create Game
        socket.on("client_requests_game_id", (callback) => {
            console.log(`Client hit the landing page.\x1b[00m`);
            const indexOfOwnersGame = games.findIndex((g) => {
                return g.owner === socket.id;
            });
            // This owner doesn't have a game!
            if (indexOfOwnersGame < 0) {
                games.push({
                    id: ++lastGameId,
                    buzzCount: 1,
                    owner: socket.id,
                    players: [],
                });
                socket.join(`Room ${lastGameId}`);
                console.log(
                    `\x1b[34m${socket.id}\x1b[31m is the proud owner of` +
                        ` \x1b[34mGame ${lastGameId}\x1b[00m`
                );
                // WARNING: I think this could lead to race conditions,
                // but what are the odds of that?
                return callback(lastGameId);
            }
            // This owner already has a game set up for them!
            else {
                console.log(
                    `\x1b[34m${socket.id}\x1b[31m already owns` +
                        ` \x1b[34mGame ${games[indexOfOwnersGame].id}\x1b[00m`
                );
                return callback(indexOfOwnersGame);
            }
        });
        //#endregion
        //#region Buzz Joins Game
        socket.on("client_joins_game", (gameId, callback) => {
            console.log(`Client wants to join ${gameId}.\x1b[00m`);
            const gameToJoin = games.find((g) => {
                return String(g.id) === String(gameId);
            });
            // This game doesn't exist!
            if (!gameToJoin) {
                console.log(
                    `\x1b[34mGame ${gameId}\x1b[31m doesn't exist?!?\x1b[00m`,
                    games
                );
                return callback({
                    error: `A game with the id ${gameId} doesn't exist`,
                });
            }
            // Joining game
            else {
                console.log(
                    `\x1b[34m${gameId}\x1b[00m was joined by \x1b[34m${socket.id}\x1b[00m`,
                    games
                );
                socket.join(`Room ${gameId}`);
                return callback(gameToJoin.players);
            }
        });
        //#endregion
        //#region Get Players
        socket.on("client_requests_players", (callback) => {
            console.log(`Client wants to know all players\x1b[00m`);
            const indexOfOwnersGame = games.findIndex((g) => {
                return g.owner === socket.id;
            });
            if (indexOfOwnersGame < 0) {
                console.log(
                    `client_requests_players: ` +
                        `\x1b[34m${socket.id}\x1b[31m isn't a game owner, bro...\x1b[00m`
                );
                return;
            }
            if (callback && typeof callback === "function")
                return callback(games[indexOfOwnersGame].players);
        });
        //#endregion
        //#region Clear Players
        socket.on("client_clears_players", (callback) => {
            console.log(`Client cleared players\x1b[00m`);
            // 1. GET THE GAME
            const indexOfOwnersGame = games.findIndex((g) => {
                return g.owner === socket.id;
            });
            if (indexOfOwnersGame < 0) {
                // !OOPS!
                console.log(
                    `client_clears_players: ` +
                        `\x1b[34m${socket.id}\x1b[31m isn't a game owner, bro...\x1b[00m`
                );
                return;
            }
            // 2. CLEAR THE PLAYERS
            games[indexOfOwnersGame].players = [];
            // 3. UPDATE GAME STATE FOR EVERYONE
            io.to(Array.from(socket.rooms)).emit(
                "server_updates_players",
                games[indexOfOwnersGame].players
            );
            if (callback && typeof callback === "function")
                return callback(games[indexOfOwnersGame].players);
        });
        //#endregion
        //#region Add New Players
        socket.on("client_adds_player", (userName, callback) => {
            console.log(
                `\x1b[34m${socket.id}\x1b[00m wants to add player` +
                    ` \x1b[34m${userName}\x1b[00m`
            );
            // 1. Get the owners game
            const indexOfOwnersGame = games.findIndex((g) => {
                return g.owner === socket.id;
            });
            if (indexOfOwnersGame < 0) {
                // !OOPS!
                console.log(
                    `client_adds_player: ` +
                        `\x1b[34m${socket.id}\x1b[31m isn't a game owner, bro...\x1b[00m`
                );
                return;
            }
            // 2. Check if the player exists
            const indexOfPlayer = games[indexOfOwnersGame].players.findIndex(
                (p) => p.name === userName
            );
            if (indexOfPlayer >= 0) {
                console.log(
                    `\x1b[31mWE'VE ALREADY GOT A \x1b[34m${userName}\x1b[00m`
                );
                io.to(Array.from(socket.rooms)).emit(
                    "server_updates_players",
                    games[indexOfOwnersGame].players
                );
                return;
            }
            // 3. Add the player
            games[indexOfOwnersGame].players.push({
                name: userName,
                socketId: null,
                buzz: 0,
            });
            console.log(
                `\x1b[34m${socket.id}\x1b[32m added player \x1b[34m${userName}\x1b[00m`,
                games[indexOfOwnersGame]
            );
            io.to(Array.from(socket.rooms)).emit(
                "server_updates_players",
                games[indexOfOwnersGame].players
            );
            if (callback && typeof callback === "function")
                return callback(games[indexOfOwnersGame].players);
        });
        //#endregion
        //#region Select Player
        socket.on("client_selects_player", (userName, callback) => {
            const playersGameData = getPlayersGameData(games, socket.id);
            if (playersGameData.playerIndex >= 0) {
                console.log(
                    `client_selects_player: ` +
                        `\x1b[31mDude! \x1b[34m${socket.id}\x1b[31m is already\x1b[34m ` +
                        games[playersGameData.gameIndex].players[
                            playersGameData.playerIndex
                        ].userName +
                        "\x1b[31m!\x1b[00m"
                );
                return;
            }
            const playersGameId = Array.from(socket.rooms)
                .find((r) => r.includes("Room"))
                .replaceAll("Room ", "");
            if (!playersGameId) {
                console.log(
                    `client_selects_player: ` +
                        `\x1b[31mDude! \x1b[34m${socket.id}\x1b[31m isn't in a` +
                        ` game!\x1b[00m`
                );
                return;
            }
            const playersGame = games.find(
                (g) => String(g.id) === String(playersGameId)
            );
            if (!playersGame) {
                console.log(
                    `client_selects_player: ` +
                        `\x1b[31mDude! \x1b[34m${userName}\x1b[31m the game the player` +
                        ` was in no longer exists!\x1b[00m`
                );
                return;
            }
            const playerToBecome = playersGame.players?.find?.((p) => {
                // console.log(
                //     p.name + String(p.name) === String(userName)
                //         ? " \x1b[32mis\x1b[001m "
                //         : " \x1b[31mis not\x1b[00m " + userName
                // );
                return String(p.name) === String(userName);
            });
            if (!playerToBecome) {
                console.log(
                    `client_selects_player: ` +
                        `\x1b[31mDude! \x1b[34m${userName}\x1b[31m isn't in` +
                        ` \x1b[34mGame ${playersGame.id}\x1b[31m.\x1b[00m`,
                    playersGame?.players,
                    playerToBecome
                );
                return;
            }
            playerToBecome.socketId = socket.id;
            io.to(Array.from(socket.rooms)).emit(
                "server_updates_players",
                playersGame.players
            );
            if (callback && typeof callback === "function")
                return callback(playersGame.players);
        });
        //#endregion
        //#region Buzz in
        socket.on("client_buzzes_in", (callback) => {
            console.log(`\x1b[34m${socket.id}\x1b[00m buzzed in`);
            const playersGameData = getPlayersGameData(games, socket.id);
            if (
                playersGameData.playerIndex < 0 ||
                playersGameData.gameIndex < 0
            ) {
                console.log(
                    `\x1b[34m${socket.id}\x1b[31m CAN'T BUZZ IN, DORK\x1b[00m`
                );
                return;
            }
            games[playersGameData.gameIndex].players[
                playersGameData.playerIndex
            ].buzz = games[playersGameData.gameIndex].buzzCount++;
            io.to(Array.from(socket.rooms)).emit(
                "server_updates_players",
                games[playersGameData.gameIndex].players
            );
            if (callback && typeof callback === "function")
                return callback(games[playersGameData.gameIndex].players);
        });
        //#endregion
        //#region Unbuzz All
        socket.on("client_unbuzzes_all", () => {
            console.log(`\x1b[35mClient unbuzzed everyone\x1b[00m`);
            const indexOfOwnersGame = games.findIndex((g) => {
                return g.owner === socket.id;
            });
            if (indexOfOwnersGame < 0) {
                // !OOPS!
                console.log(
                    `client_unbuzzes_all: ` +
                        `\x1b[34m${socket.id}\x1b[31m isn't a game owner, bro...\x1b[00m`
                );
                return;
            }
            games[indexOfOwnersGame].buzzCount = 1;
            for (let i = 0; i < games[indexOfOwnersGame].players.length; i++) {
                games[indexOfOwnersGame].players[i].buzz = 0;
            }
            io.to(Array.from(socket.rooms)).emit(
                "server_updates_players",
                games[indexOfOwnersGame].players
            );
        });
        //#endregion
        //#region Disconnect Logic
        socket.on("disconnect", () => {
            console.log(`\x1b[33m${socket.id} disconnected\x1b[00m`);
            const indexOfOwnersGame = games.findIndex((g) => {
                return g.owner === socket.id;
            });
            // OWNER DCs
            if (indexOfOwnersGame >= 0) {
                console.log(
                    `\x1b[34m${socket.id}\x1b[31m WAS A GAME OWNER! ;A;\x1b[00m`,
                    { games, indexOfOwnersGame, ownerId: socket.id }
                );
                games.splice(indexOfOwnersGame, 1);
                return;
            }
            // BUZZER DCs
            const playersGameData = getPlayersGameData(games, socket.id);
            if (
                playersGameData?.gameIndex >= 0 &&
                playersGameData?.playerIndex >= 0
            ) {
                const player =
                    games[playersGameData.gameIndex].players[
                        playersGameData.playerIndex
                    ];
                player.socketId = "";
                player.buzz = 0;
                // TODO: If the player DCed, you'd take everyone that came after
                //       them and decrease their buzz counter by 1.
                //       It'd be best to do this with a function so I could reuse
                //       the logic.
                console.log(
                    `\x1b[34m${player.name}\x1b[31m IS GONE ;A;\x1b[00m`,
                    games[playersGameData.gameIndex].players[
                        playersGameData.playerIndex
                    ]
                );
            } else {
                console.log(`\x1b[32mThe person who DCed was a nobody\x1b[00m`);
            }
        });
    } catch (err) {
        console.error(err);
    }
});

server.listen(PORT, () => {
    console.log(`Server is hosting your websockets at port ${PORT}`);
});

/**
 * @typedef GameType
 * @property {string} id The ID of this game.  Used to find it later.
 * @property {string} owner The socketId of the owner of this game.  We can kill
 * the game if they disconnect.
 * @property {number} buzzCount The current count of the buzzer for this game
 * @property {PlayerType[]} players Info about the players in the game
 **/
/**
 * @typedef PlayerType
 * @property {string} name The name the owner typed in for this player
 * @property {number} buzz The order in which the player buzzed into the game
 * @property {string} socketId The socketId of the player
 **/
