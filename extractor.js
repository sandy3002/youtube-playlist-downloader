const https = require('https');
const http = require('http');
const fs = require('fs');
const { URL } = require('url'); // Use modern URL API instead of deprecated url.parse

/**
 * Simple function to download data from a URL (supports http and https)
 * @param {string} urlStr - The URL to download
 * @returns {Promise<string>} - Resolves with response body
 */
function download(urlStr) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };

    protocol.get(options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(download(res.headers.location));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract YouTube video IDs from a playlist URL by parsing the HTML
 * @param {string} playlistUrl - YouTube playlist URL
 * @returns {Promise<string[]>} - Resolves with array of video URLs
 */
async function extractYouTubeVideoUrls(playlistUrl) {
  try {
    console.log('Fetching playlist page...');
    const html = await download(playlistUrl);
    const videos = new Set(); // Use Set from the beginning to avoid duplicates

    // Method 1: Try to extract from ytInitialData
    const initialDataRegex = /var\s+ytInitialData\s*=\s*({.*?});\s*</s;
    const match = html.match(initialDataRegex);
    
    if (match) {
      try {
        const initialData = JSON.parse(match[1]);
        
        // Navigate through the nested structure to find playlist videos
        const contents = initialData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;
        
        if (contents) {
          for (const content of contents) {
            const videoId = content.playlistVideoRenderer?.videoId;
            if (videoId) videos.add(`https://www.youtube.com/watch?v=${videoId}`);
          }
        }
      } catch (parseError) {
        console.log('Failed to parse ytInitialData, trying alternative method...');
      }
    }

    // Method 2: Fallback - extract video IDs using regex
    if (videos.size === 0) {
      const videoIdRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
      let regexMatch;
      
      while ((regexMatch = videoIdRegex.exec(html)) !== null) {
        videos.add(`https://www.youtube.com/watch?v=${regexMatch[1]}`);
      }
    }

    return [...videos]; // Convert Set to array
  } catch (error) {
    throw new Error(`Failed to extract videos: ${error.message}`);
  }
}

/**
 * Extract playlist ID from YouTube playlist URL
 * @param {string} playlistUrl - YouTube playlist URL
 * @returns {string|null} - Playlist ID or null if not found
 */
function extractPlaylistId(playlistUrl) {
  try {
    const url = new URL(playlistUrl);
    return url.searchParams.get('list');
  } catch {
    // Handle malformed URLs
    const regex = /[?&]list=([a-zA-Z0-9_-]+)/;
    const match = playlistUrl.match(regex);
    return match ? match[1] : null;
  }
}

/**
 * Main function to process a YouTube playlist
 */
async function main(playlistUrl) {
  // Validate URL has playlist ID
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    console.error('Invalid playlist URL.');
    return;
  }

  console.log(`Extracting videos from playlist: ${playlistId}`);
  
  try {
    const videoUrls = await extractYouTubeVideoUrls(playlistUrl);
    
    console.log(`\nFound ${videoUrls.length} videos:`);
    videoUrls.forEach((url, index) => {
      console.log(`${index + 1}. ${url}`);
    });
    
    // Save to file
    const outputFile = `playlist.txt`;
    fs.writeFileSync(outputFile, videoUrls.join('\n'));
    console.log(`\nVideo URLs saved to: ${outputFile}`);
    
    return videoUrls; // Return the URLs for potential further processing
  } catch (error) {
    console.error('Error:', error.message);
    return [];
  }
}

module.exports = main;