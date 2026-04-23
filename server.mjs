import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

const port = Number(process.env.PORT || 8080);
const googleApiKey = process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY || '';
const googleCalendarId =
  process.env.GOOGLE_CALENDAR_ID ||
  process.env.VITE_GOOGLE_CALENDAR_ID ||
  '075fc8ead0cabfe9bee641306e905d712f052131f84960ab83d386556b72156b@group.calendar.google.com';
const googleCalendarTimezone =
  process.env.GOOGLE_CALENDAR_TIMEZONE ||
  process.env.VITE_GOOGLE_CALENDAR_TIMEZONE ||
  'Asia/Bangkok';

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function fetchCalendarEvents({ timeMin, timeMax }) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin,
    timeMax,
  });

  if (!googleApiKey) {
    throw new Error('Missing GOOGLE_API_KEY for calendar reads.');
  }

  params.set('key', googleApiKey);

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendarId)}/events?${params.toString()}`,
  );

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Unable to read Google Calendar events: ${payload}`);
  }

  return response.json();
}

async function createCalendarEvent(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [path.join(__dirname, 'scripts/create_google_event.py')], {
      cwd: __dirname,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python event insert failed with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sanitizePath(urlPath) {
  if (!urlPath || urlPath === '/') {
    return path.join(distDir, 'index.html');
  }

  const cleanPath = urlPath.split('?')[0];
  const resolved = path.join(distDir, cleanPath);
  if (!resolved.startsWith(distDir)) {
    return path.join(distDir, 'index.html');
  }
  return resolved;
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);

    if (request.method === 'GET' && url.pathname === '/api/calendar/events') {
      const timeMin = url.searchParams.get('timeMin');
      const timeMax = url.searchParams.get('timeMax');

      if (!timeMin || !timeMax) {
        json(response, 400, { error: 'timeMin and timeMax are required.' });
        return;
      }

      const payload = await fetchCalendarEvents({ timeMin, timeMax });
      json(response, 200, payload);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/calendar/reservations') {
      const body = await parseBody(request);
      const { username, phone, reason, start, end } = body;

      if (!username || !phone || !reason || !start || !end) {
        json(response, 400, { error: 'username, phone, reason, start, and end are required.' });
        return;
      }

      const payload = await createCalendarEvent({
        username,
        phone,
        reason,
        start,
        end,
      });

      json(response, 201, payload);
      return;
    }

    const filePath = sanitizePath(url.pathname);

    try {
      const file = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': contentType(filePath) });
      response.end(file);
      return;
    } catch {
      const indexFile = await readFile(path.join(distDir, 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(indexFile);
      return;
    }
  } catch (error) {
    json(response, 500, {
      error: error instanceof Error ? error.message : 'Internal server error.',
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
