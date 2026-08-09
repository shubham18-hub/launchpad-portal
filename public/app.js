let tasks = [];
let currentUser = null;
let currentTask = null;
let selectedFile = null;
let filter = 'all';

const $ = (s) => document.querySelector(s);
const formatDate = (d) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(d + 'T12:00:00')
  );

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) throw new Error((data && data.error) || 'Something went wrong.');
  return data;
}

async function loadMe() {
  try {
    currentUser = await api('/auth/me');
  } catch {
    currentUser = null;
  }
  updateNav();
}

function updateNav() {
  const loginBtn = $('#loginOpen');
  const adminBtn = $('#adminOpen');
  if (currentUser) {
    loginBtn.textContent = `Sign out (${currentUser.name})`;
    adminBtn.style.display = ['admin', 'reviewer'].includes(currentUser.role) ? '' : 'none';
  } else {
    loginBtn.textContent = 'Sign in';
    adminBtn.style.display = 'none';
  }
}

async function loadTasks() {
  if (!currentUser) {
    tasks = [];
    render();
    return;
  }
  tasks = await api('/tasks');
  render();
}

function render() {
  const visible = filter === 'all' ? tasks : tasks.filter((t) => t.track === filter);
  $('#taskGrid').innerHTML = visible
    .map((t) => {
      const sub = t.submission;
      return `<article class="task-card"><span class="badge ${sub ? 'submitted' : ''}">${
        sub ? '● Submitted' : t.track[0].toUpperCase() + t.track.slice(1)
      }</span><h3>${t.title}</h3><div class="meta"><span>Deadline: ${formatDate(
        t.deadline
      )}</span><span>Points: ${sub?.grade ?? '—'}/${t.points}</span></div><button class="view" data-task="${
        t.id
      }">${sub ? 'View submission' : 'View details'} <span>→</span></button></article>`;
    })
    .join('');
  $('#taskCount').textContent = `${tasks.length} open mission${tasks.length !== 1 ? 's' : ''}`;
  const completed = tasks.filter((t) => t.submission).length;
  $('#progressNumber').innerHTML = `${completed}<span>/${tasks.length}</span>`;
  $('#progressLine').style.width = `${tasks.length ? (completed / tasks.length) * 100 : 0}%`;
}

function openDetail(id) {
  currentTask = tasks.find((t) => t.id === id);
  selectedFile = null;
  const sub = currentTask.submission;
  $('#detailContent').innerHTML = `<div class="detail-hero"><span class="detail-track">${
    currentTask.track
  } track</span><h2>${currentTask.title}</h2></div><div class="detail-body"><p>${
    currentTask.description
  }</p><div class="info-grid"><div class="info">DEADLINE<b>${formatDate(
    currentTask.deadline
  )}</b></div><div class="info">MAXIMUM POINTS<b>${sub?.grade ?? 'Not graded'} / ${
    currentTask.points
  }</b></div></div><div class="submission">${
    sub
      ? `<div class="submitted-box"><b>✓ Work submitted</b>${sub.file_name} · Submitted ${formatDate(
          sub.submitted_at
        )}${sub.grade != null ? ` · Graded ${sub.grade}/${currentTask.points}` : ''}</div><button class="primary" id="replaceBtn">Replace submission</button>`
      : `<h3>Submit your work</h3><label class="dropzone" for="upload"><input id="upload" type="file" accept="application/pdf" hidden><span style="font-size:30px">⇧</span><strong>Choose a PDF or drag it here</strong><span class="file-note">PDF files only · maximum 10 MB</span><span id="fileName" class="file-name"></span></label><button class="primary" id="submitBtn" disabled>Submit task <span>→</span></button>`
  }</div></div>`;
  $('#detailModal').classList.add('show');
  $('#detailModal').setAttribute('aria-hidden', 'false');
  const upload = $('#upload');
  if (upload) upload.addEventListener('change', (e) => chooseFile(e.target.files[0]));
  const submit = $('#submitBtn');
  if (submit) submit.addEventListener('click', submitWork);
  const replace = $('#replaceBtn');
  if (replace)
    replace.addEventListener('click', () => {
      currentTask.submission = null;
      openDetail(currentTask.id);
    });
}

function chooseFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf') {
    toast('Please choose a PDF file.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast('That file is over the 10 MB limit.');
    return;
  }
  selectedFile = file;
  $('#fileName').textContent = `Selected: ${file.name}`;
  $('#submitBtn').disabled = false;
}

async function submitWork() {
  if (!selectedFile || !currentTask) return;
  const form = new FormData();
  form.append('file', selectedFile);
  try {
    const sub = await api(`/submissions/${currentTask.id}`, { method: 'POST', body: form });
    currentTask.submission = sub;
    const t = tasks.find((x) => x.id === currentTask.id);
    if (t) t.submission = sub;
    render();
    openDetail(currentTask.id);
    toast('Your work has been submitted.');
  } catch (err) {
    toast(err.message);
  }
}

function closeModals() {
  document.querySelectorAll('.modal').forEach((m) => {
    m.classList.remove('show');
    m.setAttribute('aria-hidden', 'true');
  });
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

document.addEventListener('click', (e) => {
  const v = e.target.closest('[data-task]');
  if (v) openDetail(+v.dataset.task);
  if (e.target.matches('[data-close]')) closeModals();

  if (e.target.closest('#adminOpen')) {
    if (!['admin', 'reviewer'].includes(currentUser?.role)) {
      toast('Sign in with an admin account to publish tasks.');
    } else {
      $('#adminModal').classList.add('show');
    }
  }

  if (e.target.closest('#loginOpen')) {
    if (currentUser) {
      api('/auth/logout', { method: 'POST' }).then(() => {
        currentUser = null;
        updateNav();
        loadTasks();
        toast('Signed out.');
      });
    } else {
      $('#authModal').classList.add('show');
    }
  }

  const tab = e.target.closest('.tab');
  if (tab) {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    tab.classList.add('active');
    filter = tab.dataset.filter;
    render();
  }
});

$('#taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  try {
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({ ...data, points: +data.points }),
    });
    await loadTasks();
    e.target.reset();
    closeModals();
    toast('New task published successfully.');
  } catch (err) {
    toast(err.message);
  }
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  try {
    currentUser = await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
    updateNav();
    await loadTasks();
    closeModals();
    e.target.reset();
    toast(`Welcome back, ${currentUser.name}.`);
  } catch (err) {
    toast(err.message);
  }
});

(async function init() {
  await loadMe();
  await loadTasks();
})();
