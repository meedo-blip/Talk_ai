const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const channels = {
  general: { name: 'general', messages: [] },
  random: { name: 'random', messages: [] },
  announcements: { name: 'announcements', messages: [] }
};

const usersBySocketId = new Map();

const safeMessage = (raw) => String(raw || '').trim().slice(0, 500);
const safeUsername = (raw) => String(raw || '').trim().slice(0, 24) || `guest-${Math.floor(Math.random() * 1000)}`;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/channels', (req, res) => {
  const payload = Object.values(channels).map((channel) => ({
    name: channel.name,
    messageCount: channel.messages.length
  }));
  res.json(payload);
});

io.on('connection', (socket) => {
  const username = safeUsername(socket.handshake.query.username);
  usersBySocketId.set(socket.id, { username, activeChannel: 'general' });

  socket.join('general');
  socket.emit('bootstrap', {
    username,
    channels: Object.values(channels).map((channel) => ({
      name: channel.name,
      messages: channel.messages.slice(-100)
    }))
  });

  io.emit('presence:update', {
    count: usersBySocketId.size,
    users: Array.from(usersBySocketId.values()).map((user) => user.username)
  });

  socket.on('channel:join', (channelName) => {
    const chosen = safeMessage(channelName).toLowerCase();
    if (!channels[chosen]) {
      socket.emit('toast', { type: 'error', message: `Channel #${chosen || 'unknown'} does not exist` });
      return;
    }

    const user = usersBySocketId.get(socket.id);
    if (!user) return;

    socket.leave(user.activeChannel);
    user.activeChannel = chosen;
    socket.join(chosen);

    socket.emit('channel:history', {
      name: chosen,
      messages: channels[chosen].messages.slice(-100)
    });
  });

  socket.on('message:send', (payload) => {
    const user = usersBySocketId.get(socket.id);
    if (!user) return;

    const text = safeMessage(payload?.text);
    if (!text) return;

    const message = {
      id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      channel: user.activeChannel,
      author: user.username,
      text,
      timestamp: new Date().toISOString()
    };

    channels[user.activeChannel].messages.push(message);

    if (channels[user.activeChannel].messages.length > 300) {
      channels[user.activeChannel].messages.shift();
    }

    io.to(user.activeChannel).emit('message:new', message);
  });

  socket.on('disconnect', () => {
    usersBySocketId.delete(socket.id);
    io.emit('presence:update', {
      count: usersBySocketId.size,
      users: Array.from(usersBySocketId.values()).map((user) => user.username)
    });
  });
});

server.listen(PORT, () => {
  console.log(`Talk app listening on http://localhost:${PORT}`);
});
