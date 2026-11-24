const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "client.html"));
});

// socket.id -> { username, room }
const activeUsers = new Map();

function getRoomUsers(room) {
  const users = [];
  for (const user of activeUsers.values()) {
    if (user.room === room) {
      users.push(user.username);
    }
  }
  return users;
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

io.on("connection", (socket) => {
  socket.on("join_room", ({ username, room }) => {
    const cleanName = (username || "Anonymous").trim().slice(0, 24) || "Anonymous";
    const cleanRoom = (room || "general").trim().toLowerCase().slice(0, 24) || "general";

    const previous = activeUsers.get(socket.id);
    if (previous) {
      socket.leave(previous.room);
      socket.to(previous.room).emit("system_message", {
        text: `${previous.username} left #${previous.room}`,
        time: formatTime(),
      });
      io.to(previous.room).emit("room_users", getRoomUsers(previous.room));
    }

    socket.join(cleanRoom);
    activeUsers.set(socket.id, { username: cleanName, room: cleanRoom });

    socket.emit("joined_room", { username: cleanName, room: cleanRoom });

    socket.emit("system_message", {
      text: `Welcome to #${cleanRoom}, ${cleanName}!`,
      time: formatTime(),
    });

    socket.to(cleanRoom).emit("system_message", {
      text: `${cleanName} joined #${cleanRoom}`,
      time: formatTime(),
    });

    io.to(cleanRoom).emit("room_users", getRoomUsers(cleanRoom));
  });

  socket.on("chat_message", (rawText) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const text = (typeof rawText === "string" ? rawText : "").trim();
    if (!text) return;

    io.to(user.room).emit("chat_message", {
      id: `${socket.id}-${Date.now()}`,
      senderId: socket.id,
      sender: user.username,
      room: user.room,
      text,
      time: formatTime(),
    });
  });

  socket.on("typing", (isTyping) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    socket.to(user.room).emit("typing", {
      username: user.username,
      isTyping: Boolean(isTyping),
    });
  });

  socket.on("disconnect", () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    activeUsers.delete(socket.id);
    socket.to(user.room).emit("system_message", {
      text: `${user.username} disconnected`,
      time: formatTime(),
    });
    io.to(user.room).emit("room_users", getRoomUsers(user.room));
  });
});

server.listen(PORT, () => {
  console.log(`PulseChat running on http://localhost:${PORT}`);
});
