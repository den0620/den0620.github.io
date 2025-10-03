export default {
  async fetch(request) {
    const url = new URL(request.url);
    const params = url.searchParams;

    const API_KEY = 'YOUR_LASTFM_API_KEY';
    const API_BASE = 'https://ws.audioscrobbler.com/2.0/';
    
    const username = params.get('user') || params.get('username');
    
    if (!username) {
      return new Response(generateErrorSvg('Username parameter required'), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' }
      });
    }

    const apiUrl = new URL(API_BASE);
    apiUrl.searchParams.append('method', 'user.getrecenttracks');
    apiUrl.searchParams.append('user', username);
    apiUrl.searchParams.append('api_key', API_KEY);
    apiUrl.searchParams.append('format', 'json');
    apiUrl.searchParams.append('limit', '1');
    
    try {
      const response = await fetch(apiUrl.toString(), {
        headers: { 'User-Agent': 'Worker/1.0' }
      });
      
      if (!response.ok) {
        throw new Error(`Last.fm API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.message || 'Last.fm API error');
      }
      
      const track = data.recenttracks?.track?.[0];
      if (!track) {
        throw new Error('No recent tracks found');
      }
      
      const trackInfo = {
        name: track.name,
        artist: track.artist['#text'],
        album: track.album['#text'],
        url: track.url,
        image: track.image?.[3]?.['#text'] || track.image?.[2]?.['#text'] || track.image?.[1]?.['#text'] || '',
        nowplaying: track['@attr']?.nowplaying === 'true'
      };
      
      if (!trackInfo.image && trackInfo.album && trackInfo.artist) {
        try {
          const albumUrl = new URL(API_BASE);
          albumUrl.searchParams.append('method', 'album.getinfo');
          albumUrl.searchParams.append('artist', trackInfo.artist);
          albumUrl.searchParams.append('album', trackInfo.album);
          albumUrl.searchParams.append('api_key', API_KEY);
          albumUrl.searchParams.append('format', 'json');
          
          const albumResponse = await fetch(albumUrl.toString());
          if (albumResponse.ok) {
            const albumData = await albumResponse.json();
            const albumImage = albumData.album?.image?.[3]?.['#text'] || albumData.album?.image?.[2]?.['#text'];
            if (albumImage) {
              trackInfo.image = albumImage;
            }
          }
        } catch (e) {
          console.error('Failed to fetch album info:', e);
        }
      }
      
      const userApiUrl = new URL(API_BASE);
      userApiUrl.searchParams.append('method', 'user.getinfo');
      userApiUrl.searchParams.append('user', username);
      userApiUrl.searchParams.append('api_key', API_KEY);
      userApiUrl.searchParams.append('format', 'json');
      
      let playcount = '...';
      try {
        const userResponse = await fetch(userApiUrl.toString());
        if (userResponse.ok) {
          const userData = await userResponse.json();
          playcount = parseInt(userData.user?.playcount || 0).toLocaleString('en-US');
        }
      } catch (e) {
        console.error('Failed to fetch user info:', e);
      }
      
      const svg = generateSvg({
        user: username,
        status: trackInfo.nowplaying ? 'listening now' : 'last played',
        playcount,
        trackName: trackInfo.name,
        artistName: trackInfo.artist,
        albumArtUrl: trackInfo.image,
        userLink: `https://www.last.fm/user/${username}`,
        trackLink: trackInfo.url,
        artistLink: `https://www.last.fm/music/${encodeURIComponent(trackInfo.artist.replace(/ /g, '+'))}`
      });
      
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=60, s-maxage=60'
        }
      });
      
    } catch (error) {
      return new Response(generateErrorSvg(error.message), {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache'
        }
      });
    }
  }
};

function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length <= maxLength ? text : text.slice(0, maxLength - 1) + '…';
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;'
  }[c]));
}

function generateSvg(data) {
  const { user, status, playcount, trackName, artistName, albumArtUrl, userLink, trackLink, artistLink } = data;
  
  const safeTrack = escapeXml(truncateText(trackName, 28));
  const safeArtist = escapeXml(truncateText(artistName, 30));
  const safeUser = escapeXml(user);
  const safeStatus = escapeXml(status);
  const safeCount = escapeXml(playcount);

  const imageElement = albumArtUrl 
    ? `<image x="12" y="12" width="48" height="48" href="${albumArtUrl}" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="12" y="12" width="48" height="48" fill="#3a3c40" />
       <text x="36" y="40" text-anchor="middle" fill="#aaaeab" font-size="10">No Art</text>`;

  return `
    <svg viewBox="0 0 450 72" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <style>
          .container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          .track { fill: #ffffff; font-size: 1.25rem; font-weight: bold; }
          .secondary { fill: #d1c4e9; font-size: 1rem; }
          .status, .scrobbles { font-size: 1rem; text-anchor: end; }
          .username { font-weight: bold; }
          a text:hover { opacity: 0.8; }
        </style>
      </defs>
      <g class="container">
        <rect x="0" y="0" width="450" height="72" fill="blueviolet"/>
        
        <a href="${trackLink}" target="_blank">
          ${imageElement}
          <rect x="12" y="12" width="48" height="48" fill="none" stroke="indigo" stroke-width="2" vector-effect="non-scaling-stroke"/>
        </a>
        
        <a href="${trackLink}" target="_blank">
          <text class="track" x="70" y="26">${safeTrack}</text>
        </a>
        <a href="${artistLink}" target="_blank">
          <text class="secondary" x="70" y="44">${safeArtist}</text>
        </a>
        <a href="${userLink}" target="_blank">
          <text class="secondary" x="70" y="62"><tspan class="username">${safeUser}</tspan> on last.fm</text>
        </a>
        
        <text class="secondary status" x="440" y="24">${safeStatus}</text>
        <text class="secondary scrobbles" x="440" y="42">🎧 ${safeCount}</text>
      </g>
    </svg>`;
}

function generateErrorSvg(message) {
  const safeMessage = escapeXml(truncateText(message, 40));
  return `
    <svg viewBox="0 0 450 72" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; }
          .error { fill: #ffbaba; font-size: 16px; }
        </style>
      </defs>
      <g class="container">
        <rect x="0" y="0" width="100%" height="100%" fill="blueviolet"/>
        <text x="20" y="42" class="error">Error: ${safeMessage}</text>
      </g>
    </svg>`;
}

