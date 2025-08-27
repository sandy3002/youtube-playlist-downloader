const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');

/**
 * YouTube MP3 Downloader Class
 */
class downloader {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './downloads';
    this.quality = options.quality || 'highestaudio';

    // Set ffmpeg path if provided
    if (options.ffmpegPath) {
      ffmpeg.setFfmpegPath(options.ffmpegPath);
    }

    // Create output directory if needed
    !fs.existsSync(this.outputDir) &&
      fs.mkdirSync(this.outputDir, { recursive: true });
  }

  /**
   * Extract video ID from YouTube URL
   */
  extractVideoId(url) {
    const regex =
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match?.[1] || null;
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get video info
   */
  async getVideoInfo(videoId) {
    try {
      const info = await ytdl.getInfo(videoId);
      const { videoDetails } = info;
      const title = this.sanitizeFilename(videoDetails.title);

      return {
        title: videoDetails.title,
        filename: `${title}.mp3`,
        duration: videoDetails.lengthSeconds,
        author: videoDetails.author.name,
      };
    } catch (error) {
      throw new Error(`Failed to get video info: ${error.message}`);
    }
  }

  /**
   * Download single YouTube video as MP3
   */
  async downloadMp3(url, customName = null) {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      return Promise.reject(new Error(`Invalid YouTube URL: ${url}`));
    }

    console.log(`Processing: ${url}`);

    try {
      const videoInfo = await this.getVideoInfo(videoId);
      const filename = customName
        ? `${this.sanitizeFilename(customName)}.mp3`
        : videoInfo.filename;
      const outputPath = path.join(this.outputDir, filename);

      // Check if file already exists
      if (fs.existsSync(outputPath)) {
        console.log(`File already exists: ${filename}`);
        return {
          success: true,
          filename,
          message: 'File already exists',
          skipped: true,
        };
      }

      console.log(`Downloading: ${videoInfo.title}`);
      console.log(`Author: ${videoInfo.author}`);
      console.log(
        `Duration: ${Math.floor(videoInfo.duration / 60)}:${String(
          videoInfo.duration % 60
        ).padStart(2, '0')}`
      );

      return new Promise((resolve, reject) => {
        // Create streams
        const ytdlStream = ytdl(videoId, {
          quality: this.quality,
          filter: 'audioonly',
        });

        // Convert to MP3
        ffmpeg(ytdlStream)
          .audioCodec('libmp3lame')
          .audioBitrate(192)
          .audioFrequency(44100)
          .format('mp3')
          .output(outputPath)
          .on('end', () => {
            console.log(`✅ Downloaded: ${filename}`);
            resolve({
              success: true,
              filename,
              path: outputPath,
              title: videoInfo.title,
            });
          })
          .on('error', (err) => {
            reject(new Error(`ffmpeg error: ${err.message}`));
          })
          .run();
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Download multiple URLs from a file
   */
  async downloadFromFile(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const {
      concurrent = 1,
      delay = 15000,
      startIndex = 0,
      endIndex = Infinity,
    } = options;

    // Parse URLs from file
    const content = fs.readFileSync(filePath, 'utf8');
    const urls = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .filter(
        (line) => line.includes('youtube.com') || line.includes('youtu.be')
      );

    if (!urls.length) {
      throw new Error('No valid YouTube URLs found in file');
    }

    // Apply index range
    const startIdx = Math.max(0, startIndex);
    const endIdx = Math.min(
      urls.length,
      endIndex === Infinity ? urls.length : endIndex
    );
    const urlsToProcess = urls.slice(startIdx, endIdx);

    console.log(`Found ${urls.length} YouTube URLs in file`);
    console.log(
      `Processing ${urlsToProcess.length} URLs (index ${startIdx} to ${
        endIdx - 1
      })`
    );

    const results = [];
    const errors = [];

    if (concurrent === 1) {
      // Sequential download
      for (let i = 0; i < urlsToProcess.length; i++) {
        const url = urlsToProcess[i];
        try {
          console.log(
            `\nProgress: ${i + 1}/${urlsToProcess.length} (file index: ${
              startIdx + i
            })`
          );
          const result = await this.downloadMp3(url);
          results.push({ url, ...result });

          // Add delay between downloads
          if (i < urlsToProcess.length - 1 && delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (error) {
          console.error(`❌ Failed to download ${url}: ${error.message}`);
          errors.push({ url, error: error.message });
        }
      }
    } else {
      // Concurrent download with chunking
      for (let i = 0; i < urlsToProcess.length; i += concurrent) {
        const chunk = urlsToProcess.slice(i, i + concurrent);
        const promises = chunk.map((url, idx) =>
          this.downloadMp3(url)
            .then((result) => ({ url, ...result }))
            .catch((error) => ({ url, error: error.message }))
        );

        const chunkResults = await Promise.all(promises);

        chunkResults.forEach((result) => {
          if (result.error) {
            errors.push(result);
            console.error(
              `❌ Failed to download ${result.url}: ${result.error}`
            );
          } else {
            results.push(result);
          }
        });

        // Delay between chunks
        if (i + concurrent < urlsToProcess.length && delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return {
      results,
      errors,
      total: urlsToProcess.length,
      fullListTotal: urls.length,
    };
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const args = process.argv.slice(2);

    if (args.length === 0) {
      console.log(`
Usage: node downloader.js <urls-file> [options]

Options:
  --output-dir <dir>    Output directory (default: ./downloads)
  --concurrent <num>    Concurrent downloads (default: 1)
  --delay <ms>          Delay between downloads in ms (default: 15000)
  --start <index>       Starting index (0-based, default: 0)
  --end <index>         Ending index (inclusive, default: process all)
  
Example:
  node downloader.js urls.txt --output-dir ./music --concurrent 2
  node downloader.js urls.txt --start 5 --end 10
      `);
      return;
    }

    const filePath = args[0];
    const getArg = (flag, defaultVal) => {
      const index = args.indexOf(flag);
      return index !== -1 ? args[index + 1] : defaultVal;
    };

    const outputDir = getArg('--output-dir', './downloads');
    const concurrent = parseInt(getArg('--concurrent', '1'));
    const delay = parseInt(getArg('--delay', '15000'));
    const startIndex = parseInt(getArg('--start', '0'));
    const endIndex = getArg('--end') ? parseInt(getArg('--end')) + 1 : Infinity; // +1 because end is inclusive

    const ytDownloader = new downloader({ outputDir });

    console.log(`🎵 YouTube MP3 Downloader`);
    console.log(`📁 Output directory: ${outputDir}`);
    console.log(`⚡ Concurrent downloads: ${concurrent}`);
    console.log(`⏰ Delay between downloads: ${delay}ms`);
    console.log(
      `📋 Processing index range: ${startIndex} to ${
        endIndex === Infinity ? 'end' : endIndex - 1
      }\n`
    );

    const startTime = Date.now();
    const { results, errors, total, fullListTotal } =
      await ytDownloader.downloadFromFile(filePath, {
        concurrent,
        delay,
        startIndex,
        endIndex,
      });
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(`\n📊 Download Summary:`);
    console.log(`✅ Successful: ${results.length}/${total}`);
    console.log(`❌ Failed: ${errors.length}/${total}`);
    console.log(
      `🔢 Range: ${startIndex} to ${
        endIndex === Infinity ? fullListTotal - 1 : endIndex - 1
      } of ${fullListTotal} URLs`
    );
    console.log(`⏱️  Total time: ${duration}s`);

    if (errors.length > 0) {
      console.log(`\n❌ Failed Downloads:`);
      errors.forEach(({ url, error }) => console.log(`  ${url}: ${error}`));
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = downloader;

// Run if executed directly
if (require.main === module) {
  main();
}
