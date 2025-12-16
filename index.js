import express from "express";
import http from "http";
import { Server } from "socket.io";

import cors from "cors";

const PORT = process.env.PORT || 3675;
const app = express();
app.use(cors());

const server = http.createServer(app);

console.log("Starting Express Server");

/** @type {{name: string, buzz: number, socketId: string | null }[]} */
let players = [];
let buzzCount = 1;

const io = new Server(server, {
    handlePreflightRequest: (req, res) => {
        const headers = {
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Origin": req.headers.origin, //or the specific origin you want to give access to,
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

io.emit("server_updates_players", players);

io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}\x1b[00m`);
    //#endregion
    //#region Welcome
    socket.emit("welcome", players);
    //#endregion
    //#region Get Players
    socket.on("client_requests_players", (callback) => {
        console.log(`Client wants to know all players\x1b[00m`);
        if (callback && typeof callback === "function")
            return callback(players);
    });
    //#endregion
    //#region Clear Players
    socket.on("client_clears_players", (callback) => {
        console.log(`Client cleared players\x1b[00m`);
        players = [];
        io.emit("server_updates_players", players);
        if (callback && typeof callback === "function")
            return callback(players);
    });
    //#endregion
    //#region Add Players
    socket.on("client_adds_player", (userName, callback) => {
        console.log(`Client added player \x1b[34m${userName}\x1b[00m`);
        const indexOfPlayer = players.findIndex((p) => p.name === userName);
        if (indexOfPlayer < 0) {
            players.push({
                name: userName,
                socketId: null,
                buzz: 0,
            });
            io.emit("server_updates_players", players);
            if (callback && typeof callback === "function")
                return callback(players);
        } else {
            console.log(
                `\x1b[31mWE'VE ALREADY GOT A \x1b[34m${userName}\x1b[00m`
            );
            io.emit("server_updates_players", players);
        }
    });
    //#endregion
    //#region Select Player
    socket.on("client_selects_player", (userName, callback) => {
        const indexOfPlayer = players.findIndex(
            (p) => p.name === userName && !p?.socketId
        );
        if (indexOfPlayer >= 0) {
            players[indexOfPlayer].socketId = socket.id;
            io.emit("server_updates_players", players);
            if (callback && typeof callback === "function")
                return callback(players);
        } else {
            console.log(`\x1b[31mYOU CAN'T SELECT \x1b[34m${userName}\x1b[00m`);
            io.emit("server_updates_players", players);
        }
    });
    //#endregion
    //#region Buzz in
    socket.on("client_buzzes_in", (userName, callback) => {
        console.log(`\x1b[34m${userName}\x1b[00m buzzed in`);
        const indexOfPlayer = players.findIndex(
            (p) => p.name === userName && p.buzz < 1
        );
        if (indexOfPlayer >= 0) {
            players[indexOfPlayer].buzz = buzzCount;
            buzzCount++;
            io.emit("server_updates_players", players);
            if (callback && typeof callback === "function")
                return callback(players);
        } else {
            console.log(`\x1b[31m${userName} CAN'T BUZZ IN, DORK\x1b[00m`);
            io.emit("server_updates_players", players);
        }
    });
    //#endregion
    //#region Unbuzz All

    socket.on("client_unbuzzes_all", () => {
        console.log(`\x1b[35mClient unbuzzed everyone\x1b[00m`);

        buzzCount = 1;
        for (let i = 0; i < players.length; i++) {
            players[i].buzz = 0;
        }
        io.emit("server_updates_players", players);
    });
    //#endregion
    //#region Disconnect Logic
    socket.on("disconnect", () => {
        console.log(`\x1b[33m${socket.id} disconnected\x1b[00m`);
        const indexOfPlayer = players.findIndex(
            (p) => p.socketId === socket.id
        );
        if (indexOfPlayer >= 0) {
            players[indexOfPlayer].socketId = "";
            console.log(
                `\x1b[34m${players[indexOfPlayer].name}\x1b[31m IS GONE ;A;\x1b[00m`
            );
        } else {
            console.log(
                `\x1b[32mThe person who DCed hadn't selected a player yet\x1b[00m`
            );
        }
        io.emit("server_updates_players", players);
    });
});

server.listen(PORT, () => {
    console.log(`Server is hosting your websockets at port ${PORT}`);
});
