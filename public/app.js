let tasks = [];
let currentUser = null;
let currentTask = null;
let selectedFile = null;
let filter = 'all';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const formatDate = (d) => {
  const date = typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00:00') : new Date(d);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

function isStaff() {
  return ['admin', 'reviewer'].includes(currentUser?.role);
}

function updateNav() {
  const loginBtn = $('#loginOpen');
  const adminBtn = $('#adminOpen');
  if (currentUser) {
    loginBtn.textContent = `Sign out (${currentUser.name})`;
    adminBtn.style.display = isStaff() ? '' : 'none';
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
  const grid = $('#taskGrid');
  const empty = $('#taskEmpty');

  const progressCard = $('#progress');
  if (!currentUser) {
    grid.innerHTML = '';
    empty.hidden = false;
    $('#taskCount').textContent = '';
    progressCard.classList.add('hidden');
    return;
  }
  empty.hidden = true;
  progressCard.classList.remove('hidden');

  const visible = filter === 'all' ? tasks : tasks.filter((t) => t.track === filter);
  grid.innerHTML = visible
    .map((t) => {
      const sub = t.submission;
      const staffMeta = isStaff()
        ? `<span>Deadline: ${formatDate(t.deadline)}</span><span>${t.submission_count ?? 0} submission${
            t.submission_count === 1 ? '' : 's'
          }</span>`
        : `<span>Deadline: ${formatDate(t.deadline)}</span><span>Points: ${sub?.grade ?? '—'}/${t.points}</span>`;
      const badgeLabel = isStaff()
        ? t.track[0].toUpperCase() + t.track.slice(1)
        : sub
        ? '● Submitted'
        : t.track[0].toUpperCase() + t.track.slice(1);
      return `<article class="task-card"><span class="badge ${sub && !isStaff() ? 'submitted' : ''}">${badgeLabel}</span><h3>${escapeHtml(
        t.title
      )}</h3><div class="meta">${staffMeta}</div><button class="view" data-task="${t.id}">${
        isStaff() ? 'Review submissions' : sub ? 'View submission' : 'View details'
      } <span>→</span></button></article>`;
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
  if (isStaff()) {
    openReview(currentTask);
  } else {
    openSubmit(currentTask);
  }
  $('#detailModal').classList.add('show');
  $('#detailModal').setAttribute('aria-hidden', 'false');
}

function openSubmit(task) {
  const sub = task.submission;
  $('#detailContent').innerHTML = `<div class="detail-hero"><span class="detail-track">${escapeHtml(
    task.track
  )} track</span><h2>${escapeHtml(task.title)}</h2></div><div class="detail-body"><p>${escapeHtml(
    task.description
  )}</p><div class="info-grid"><div class="info">DEADLINE<b>${formatDate(
    task.deadline
  )}</b></div><div class="info">MAXIMUM POINTS<b>${sub?.grade ?? 'Not graded'} / ${
    task.points
  }</b></div></div><div class="submission">${
    sub
      ? `<div class="submitted-box"><b>✓ Work submitted</b>${escapeHtml(sub.file_name)} · Submitted ${formatDate(
          sub.submitted_at
        )}${sub.grade != null ? ` · Graded ${sub.grade}/${task.points}` : ''}</div><button class="primary" id="replaceBtn">Replace submission</button>`
      : `<h3>Submit your work</h3><label class="dropzone" for="upload"><input id="upload" type="file" accept="application/pdf" hidden><span style="font-size:30px">⇧</span><strong>Choose a PDF or drag it here</strong><span class="file-note">PDF files only · maximum 10 MB</span><span id="fileName" class="file-name"></span></label><button class="primary" id="submitBtn" disabled>Submit task <span>→</span></button>`
  }</div></div>`;

  const upload = $('#upload');
  if (upload) upload.addEventListener('change', (e) => chooseFile(e.target.files[0]));
  const submit = $('#submitBtn');
  if (submit) submit.addEventListener('click', submitWork);
  const replace = $('#replaceBtn');
  if (replace)
    replace.addEventListener('click', () => {
      currentTask.submission = null;
      openSubmit(currentTask);
    });
}

async function openReview(task) {
  $('#detailContent').innerHTML = `<div class="detail-hero"><span class="detail-track">${escapeHtml(
    task.track
  )} track</span><h2>${escapeHtml(task.title)}</h2></div><div class="detail-body"><p>${escapeHtml(
    task.description
  )}</p><div class="info-grid"><div class="info">DEADLINE<b>${formatDate(
    task.deadline
  )}</b></div><div class="info">MAX POINTS<b>${task.points}</b></div></div><div id="reviewList" class="review-list"><div class="no-submissions">Loading submissions…</div></div>${
    currentUser.role === 'admin'
      ? `<button class="danger" id="deleteTaskBtn">Delete this task</button>`
      : ''
  }</div>`;

  const deleteBtn = $('#deleteTaskBtn');
  if (deleteBtn) deleteBtn.addEventListener('click', () => deleteTask(task.id));

  try {
    const subs = await api(`/submissions/task/${task.id}`);
    renderReviewList(task, subs);
  } catch (err) {
    $('#reviewList').innerHTML = `<div class="no-submissions">${escapeHtml(err.message)}</div>`;
  }
}

function renderReviewList(task, subs) {
  const list = $('#reviewList');
  if (!list) return;
  if (subs.length === 0) {
    list.innerHTML = `<div class="no-submissions">No one has submitted this mission yet.</div>`;
    return;
  }
  list.innerHTML = subs
    .map(
      (s) => `<div class="review-row" data-sub="${s.id}">
        <div class="who"><b>${escapeHtml(s.student_name)}</b><span>${escapeHtml(s.student_email)}</span></div>
        <div class="file-line">📄 <a href="/api/submissions/${s.id}/file" target="_blank" rel="noopener">${escapeHtml(
        s.file_name
      )}</a> · Submitted ${formatDate(s.submitted_at)}</div>
        <div class="grade-row">
          <input type="number" min="0" max="${task.points}" placeholder="Score" value="${s.grade ?? ''}" data-grade-input />
          <button data-save-grade>Save grade</button>
          <span class="graded-tag" data-graded-tag>${s.grade != null ? `✓ Graded ${s.grade}/${task.points}` : ''}</span>
        </div>
      </div>`
    )
    .join('');

  $$('#reviewList [data-save-grade]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.review-row');
      const subId = row.dataset.sub;
      const input = row.querySelector('[data-grade-input]');
      const grade = Number(input.value);
      if (input.value === '' || Number.isNaN(grade)) {
        toast('Enter a numeric score first.');
        return;
      }
      try {
        await api(`/submissions/${subId}/grade`, { method: 'POST', body: JSON.stringify({ grade }) });
        row.querySelector('[data-graded-tag]').textContent = `✓ Graded ${grade}/${task.points}`;
        toast('Grade saved.');
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

async function deleteTask(id) {
  if (!confirm('Delete this task? This cannot be undone.')) return;
  try {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    closeModals();
    await loadTasks();
    toast('Task deleted.');
  } catch (err) {
    toast(err.message);
  }
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
    openSubmit(currentTask);
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

function openAuth() {
  closeModals();
  $('#authModal').classList.add('show');
  $('#authModal').setAttribute('aria-hidden', 'false');
}

function closeMobileNav() {
  $('#primaryNav').classList.remove('open');
  $('#menuToggle').setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (e) => {
  const v = e.target.closest('[data-task]');
  if (v) openDetail(+v.dataset.task);
  if (e.target.matches('[data-close]')) closeModals();

  if (e.target.closest('#adminOpen')) {
    if (!isStaff()) {
      toast('Sign in with an admin account to publish tasks.');
    } else {
      $('#adminModal').classList.add('show');
      $('#adminModal').setAttribute('aria-hidden', 'false');
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
      openAuth();
    }
  }

  if (e.target.closest('#heroSignIn') || e.target.closest('#emptySignIn')) {
    if (currentUser) {
      document.getElementById('tasks').scrollIntoView({ behavior: 'smooth' });
    } else {
      openAuth();
    }
  }

  const tab = e.target.closest('.tab');
  if (tab) {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    tab.classList.add('active');
    filter = tab.dataset.filter;
    render();
  }

  if (e.target.closest('#menuToggle')) {
    const nav = $('#primaryNav');
    const open = nav.classList.toggle('open');
    $('#menuToggle').setAttribute('aria-expanded', String(open));
  }

  if (e.target.closest('#primaryNav a')) closeMobileNav();
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

// Reveal the trajectory line once its section scrolls into view.
function initTrajectoryReveal() {
  const el = $('#trajectory');
  if (!el || !('IntersectionObserver' in window)) {
    if (el) el.classList.add('in-view');
    return;
  }
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          el.classList.add('in-view');
          obs.disconnect();
        }
      });
    },
    { threshold: 0.35 }
  );
  obs.observe(el);
}

(async function init() {
  initTrajectoryReveal();
  await loadMe();
  await loadTasks();
})();
