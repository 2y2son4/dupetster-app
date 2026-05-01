const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Load .env.proxy file if present (no extra dependencies needed)
const envFile = path.resolve(__dirname, '..', '.env.proxy');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
  console.log('[proxy] Loaded credentials from .env.proxy');
}

const PORT = Number(process.env.SPOTIFY_PROXY_PORT || 8787);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(body);
}

function extractPlaylistId(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    return null;
  }

  if (/^[a-zA-Z0-9]{22}$/.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/\/playlist\/([a-zA-Z0-9]{22})/);
    return match && match[1] ? match[1] : null;
  } catch {
    return null;
  }
}

function parseYear(releaseDate) {
  if (!releaseDate || typeof releaseDate !== 'string') {
    return 2000;
  }
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : 2000;
}

function httpsJsonRequest(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const statusCode = res.statusCode || 500;
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`Request failed (${statusCode}): ${data}`));
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function fetchAccessToken(clientId, clientSecret) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenData = await httpsJsonRequest(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
    'grant_type=client_credentials',
  );

  return tokenData.access_token || null;
}

async function fetchPlaylistTracks(playlistId, accessToken) {
  const tracks = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (nextUrl) {
    const page = await httpsJsonRequest(nextUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    for (const item of page.items || []) {
      const track = item && item.track ? item.track : null;
      if (!track || !track.id || !track.name) {
        continue;
      }

      tracks.push({
        id: track.id,
        name: track.name,
        artists: (track.artists || []).map((a) => a && a.name).filter(Boolean),
        album: (track.album && track.album.name) || '',
        year: parseYear(track.album && track.album.release_date),
        spotifyUrl:
          (track.external_urls && track.external_urls.spotify) ||
          `https://open.spotify.com/track/${track.id}`,
      });
    }

    nextUrl = page.next || null;
  }

  return tracks;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && parsed.pathname === '/health') {
    sendJson(res, 200, { ok: true, port: PORT });
    return;
  }

  if (req.method === 'GET' && parsed.pathname === '/api/playlist-tracks') {
    const playlistInput = parsed.searchParams.get('playlist') || '';
    const playlistId = extractPlaylistId(playlistInput);

    if (!playlistId) {
      sendJson(res, 400, { ok: false, error: 'Invalid Spotify playlist URL/ID' });
      return;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      sendJson(res, 500, {
        ok: false,
        error:
          'Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment. Set them before running start:proxy.',
      });
      return;
    }

    try {
      const token = await fetchAccessToken(clientId, clientSecret);
      if (!token) {
        sendJson(res, 500, { ok: false, error: 'Failed to get Spotify access token' });
        return;
      }

      const tracks = await fetchPlaylistTracks(playlistId, token);
      sendJson(res, 200, { ok: true, playlistId, tracks });
      return;
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || 'Spotify proxy failure' });
      return;
    }
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[spotify-proxy] running on http://127.0.0.1:${PORT}`);
  console.log('[spotify-proxy] endpoint: GET /api/playlist-tracks?playlist=<url-or-id>');
});
