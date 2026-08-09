const $ = (selector) => document.querySelector(selector);
let registerMode = false;
let hasUpload = false;

function setMode(register) {
  registerMode = register;
  $('#formTitle').textContent = register ? 'Create your account' : 'Sign in to your workspace';
  $('#formSubtitle').textContent = register ? 'Your workspace is ready in a minute.' : 'Use your email to continue.';
  $('#nameField').classList.toggle('hidden', !register);
  $('#fullName').required = register;
  $('#password').autocomplete = register ? 'new-password' : 'current-password';
  $('#submitButton').innerHTML = `${register ? 'Create account' : 'Sign in'} <span>→</span>`;
  $('#switcher').innerHTML = register ? 'Already have an account? <button type="button" id="switchMode">Sign in</button>' : 'New to DataLens? <button type="button" id="switchMode">Create an account</button>';
  $('#switchMode').addEventListener('click', () => setMode(!registerMode));
  $('#formMessage').textContent = '';
}

function setMessage(message, isError = true) {
  const target = $('#formMessage'); target.textContent = message; target.classList.toggle('success', !isError);
}

async function showDashboard(user) {
  $('#authView').classList.add('hidden'); $('#dashboardView').classList.remove('hidden');
  $('#userEmail').textContent = user.email;
  $('#joined').textContent = `Account created ${new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`;
  await loadUpload();
}

function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`; }
function renderUpload(upload) {
  hasUpload = Boolean(upload);
  $('#analyse').disabled = !hasUpload; $('#numbers').disabled = !hasUpload;
  $('#fileInput').disabled = hasUpload; $('#uploadFile').disabled = hasUpload;
  const status = $('#uploadStatus');
  if (upload) {
    status.textContent = `Stored in PostgreSQL: ${upload.file_name} · ${upload.mime_type} · ${formatBytes(upload.file_size_bytes)} · ${new Date(upload.uploaded_at).toLocaleString()}`;
    $('#uploadCard').classList.add('complete');
  } else { status.textContent = 'Upload a file to unlock the calculator.'; $('#uploadCard').classList.remove('complete'); }
}
async function loadUpload() {
  const response = await fetch('/api/uploads/me', { headers: { Authorization: `Bearer ${localStorage.getItem('datalens_token')}` } });
  if (response.ok) renderUpload((await response.json()).upload);
}

async function restoreSession() {
  const token = localStorage.getItem('datalens_token');
  if (!token) return;
  const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
  if (response.ok) await showDashboard((await response.json()).user);
  else localStorage.removeItem('datalens_token');
}

$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#submitButton'); button.disabled = true; setMessage('');
  try {
    const payload = { email: $('#email').value, password: $('#password').value };
    if (registerMode) payload.fullName = $('#fullName').value;
    const response = await fetch(`/api/auth/${registerMode ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    localStorage.setItem('datalens_token', data.token); await showDashboard(data.user);
  } catch (error) { setMessage(error.message || 'Unable to continue.'); }
  finally { button.disabled = false; }
});

$('#logout').addEventListener('click', () => { localStorage.removeItem('datalens_token'); location.reload(); });
$('#uploadFile').addEventListener('click', async () => {
  const file = $('#fileInput').files[0]; const status = $('#uploadStatus');
  if (!file) { status.textContent = 'Choose a file first.'; return; }
  const button = $('#uploadFile'); button.disabled = true; button.textContent = 'Uploading…';
  try {
    const formData = new FormData(); formData.append('file', file);
    const response = await fetch('/api/uploads', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('datalens_token')}` }, body: formData });
    const data = await response.json(); if (!response.ok) throw new Error(data.message);
    renderUpload(data.upload);
  } catch (error) { status.textContent = error.message || 'Upload failed.'; }
  finally { if (!hasUpload) { button.disabled = false; button.textContent = 'Upload file'; } }
});
$('#analyse').addEventListener('click', () => {
  const values = $('#numbers').value.split(',').map((value) => Number(value.trim())).filter(Number.isFinite);
  const results = $('#results');
  if (!values.length) { results.textContent = 'Enter one or more valid numbers separated by commas.'; results.classList.remove('hidden'); return; }
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = total / values.length;
  results.innerHTML = `<div><strong>${values.length}</strong><span>values</span></div><div><strong>${total.toLocaleString()}</strong><span>total</span></div><div><strong>${average.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><span>average</span></div><div><strong>${Math.min(...values).toLocaleString()}–${Math.max(...values).toLocaleString()}</strong><span>range</span></div>`;
  results.classList.remove('hidden');
});
setMode(false); restoreSession();
