const { WebSocketServer } = require("ws");

// In-memory state
const clients = new Map(); // ws -> { username, userId, avatar, role, color }
const messageHistory = [];
const MAX_HISTORY = 100;

// Special roles config - add usernames here
const SPECIAL_ROLES = {
  // "YourUsername": { role: "Owner", color: "#a60411", badge: "👑" },
  // "SomeUser": { role: "Dev", color: "#4a90e2", badge: "🔧" },
};

const ROLE_COLORS = {
  Owner:   "#a60411",
  Dev:     "#4a90e2",
  Mod:     "#2ecc71",
  Vip:     "#f39c12",
  Member:  "#96a0a8",
};

function getRoleInfo(username) {
  if (SPECIAL_ROLES[username]) return SPECIAL_ROLES[username];
  return { role: "Member", color: ROLE_COLORS.Member, badge: "" };
}

function broadcast(data, excludeWs = null) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws !== excludeWs && ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

function broadcastAll(data) {
  broadcast(data, null);
}

function broadcastOnlineList() {
  const online = [];
  for (const [, info] of clients) {
    online.push({
      username: info.username,
      userId:   info.userId,
      avatar:   info.avatar,
      role:     info.role,
      roleColor: info.roleColor,
      badge:    info.badge,
    });
  }
  broadcastAll({ type: "online_list", users: online });
}

const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

wss.on("connection", (ws, req) => {
  console.log("New connection");

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case "join": {
        const roleInfo = getRoleInfo(msg.username || "Unknown");
        const info = {
          username:  msg.username  || "Unknown",
          userId:    msg.userId    || "0",
          avatar:    msg.avatar    || "",
          role:      roleInfo.role,
          roleColor: roleInfo.color,
          badge:     roleInfo.badge,
        };
        clients.set(ws, info);

        ws.send(JSON.stringify({ type: "history", messages: messageHistory }));

        broadcastAll({
          type:      "system",
          text:      `${info.username} joined the network`,
          timestamp: Date.now(),
        });

        broadcastOnlineList();
        break;
      }

      case "message": {
        const info = clients.get(ws);
        if (!info) return;

        const entry = {
          type:      "message",
          id:        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          username:  info.username,
          userId:    info.userId,
          avatar:    info.avatar,
          role:      info.role,
          roleColor: info.roleColor,
          badge:     info.badge,
          text:      String(msg.text || "").slice(0, 500),
          timestamp: Date.now(),
          gameId:    msg.gameId    || "",
          serverId:  msg.serverId  || "",
        };

        messageHistory.push(entry);
        if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

        broadcastAll(entry);
        break;
      }

      case "ping": {
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      }
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);
    if (info) {
      clients.delete(ws);
      broadcastAll({
        type:      "system",
        text:      `${info.username} left the network`,
        timestamp: Date.now(),
      });
      broadcastOnlineList();
    }
  });

  ws.on("error", () => {
    clients.delete(ws);
  });
});

console.log(`WebSocket server running on port ${process.env.PORT || 8080}`);
