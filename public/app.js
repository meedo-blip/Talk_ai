const username =
  window.localStorage.getItem('talk-username') ||
  window.prompt('Pick a username for Talk:') ||
  `guest-${Math.floor(Math.random() * 1000)}`;

window.localStorage.setItem('talk-username', username);

const socket = typeof window.io === 'function'
  ? window.io({ query: { username } })
  : null;

const state = {
  username,
  activeChannel: 'general',
  channels: {},
  users: []
};

const channelList = document.getElementById('channelList');
const messageList = document.getElementById('messageList');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const activeChannel = document.getElementById('activeChannel');
const activeUsername = document.getElementById('activeUsername');
const presenceCount = document.getElementById('presenceCount');
const presenceUsers = document.getElementById('presenceUsers');
const toast = document.getElementById('toast');

activeUsername.textContent = socket
  ? `Logged in as ${state.username}`
  : `Offline preview as ${state.username}`;

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2800);
};

const formatTime = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const renderChannels = () => {
  channelList.innerHTML = '';
  Object.keys(state.channels).forEach((name) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = `channel-btn ${state.activeChannel === name ? 'active' : ''}`;
    btn.textContent = `#${name}`;
    btn.addEventListener('click', () => {
      state.activeChannel = name;
      if (socket) socket.emit('channel:join', name);
      renderChannels();
      renderMessages();
      activeChannel.textContent = `#${name}`;
      messageInput.placeholder = `Message #${name}`;
    });
    li.appendChild(btn);
    channelList.appendChild(li);
  });
};

const renderMessages = () => {
  messageList.innerHTML = '';
  const messages = state.channels[state.activeChannel]?.messages || [];

  if (!messages.length) {
    const empty = document.createElement('p');
    empty.className = 'time';
    empty.textContent = 'No messages yet. Say hello 👋';
    messageList.appendChild(empty);
    return;
  }

  messages.forEach((msg) => {
    const wrap = document.createElement('article');
    wrap.className = 'message';
    wrap.innerHTML = `
      <div class="meta">
        <span class="author">${msg.author}</span>
        <span class="time">${formatTime(msg.timestamp)}</span>
      </div>
      <div class="text"></div>
    `;
    wrap.querySelector('.text').textContent = msg.text;
    messageList.appendChild(wrap);
  });

  messageList.scrollTop = messageList.scrollHeight;
};

const renderPresence = () => {
  presenceCount.textContent = state.users.length;
  presenceUsers.innerHTML = '';
  state.users.forEach((user) => {
    const item = document.createElement('li');
    item.className = 'time';
    item.textContent = user;
    presenceUsers.appendChild(item);
  });
};

if (socket) {
  socket.on('bootstrap', (payload) => {
    payload.channels.forEach((channel) => {
      state.channels[channel.name] = channel;
    });
    renderChannels();
    renderMessages();
  });

  socket.on('channel:history', (channel) => {
    state.channels[channel.name] = channel;
    renderChannels();
    renderMessages();
  });

  socket.on('message:new', (message) => {
    const targetChannel = message.channel;
    if (!state.channels[targetChannel]) {
      state.channels[targetChannel] = { name: targetChannel, messages: [] };
    }

    state.channels[targetChannel].messages.push(message);
    if (state.channels[targetChannel].messages.length > 100) {
      state.channels[targetChannel].messages.shift();
    }

    if (targetChannel === state.activeChannel) {
      renderMessages();
    }
  });

  socket.on('presence:update', (payload) => {
    state.users = payload.users;
    renderPresence();
  });

  socket.on('toast', ({ message }) => {
    showToast(message);
  });
}

renderChannels();
renderMessages();
renderPresence();

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  if (socket) {
    socket.emit('message:send', {
      channel: state.activeChannel,
      text
    });
  } else {
    showToast('Realtime server is unavailable in preview mode.');
  }

  messageInput.value = '';
  messageInput.focus();
});
