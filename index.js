const readline = require('readline');
const fs = require('fs');
const extractPlaylist = require('./extractor.js');
const downloader = require('./downloader');

// Create interface for reading input from command line
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Function to ask questions and get user input
function askQuestion(query) {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
}

// Main async function to get all inputs
async function getPlaylistDetails() {
    try {
        const playlistUrl = await askQuestion('Enter YouTube playlist URL: ');
        console.log('\nExtracting playlist data to determine length...');
        const playlistData = await extractPlaylist(playlistUrl);
        const totalVideos = playlistData.length;
        // console.log(`Found ${totalVideos} videos in the playlist`);
        
        let startIndexInput = await askQuestion('Enter starting index (leave empty for first video): ');
        let startIndex = startIndexInput === '' ? 0 : parseInt(startIndexInput, 10);
        
        let endIndexInput = await askQuestion(`Enter ending index (leave empty for last video [${totalVideos - 1}]): `);
        let endIndex = endIndexInput === '' ? totalVideos - 1 : parseInt(endIndexInput, 10);
        endIndex++;
        // Validate inputs
        if (isNaN(startIndex) || isNaN(endIndex)) {
            console.error('Error: Indices must be valid numbers');
            return;
        }

        if (startIndex < 0 || endIndex < startIndex) {
            console.error('Error: Invalid index range');
            return;
        }

        // console.log('\nPlaylist information:');
        // console.log(`Playlist URL: ${playlistUrl}`);
        // console.log(`Download range: ${startIndex} to ${endIndex}`);

        // Apply the range filter
        const endIdx = Math.min(endIndex, totalVideos - 1);
        const selectedVideos = playlistData.slice(startIndex, endIdx + 1);

        // Process each video in the range
        const ytDownloader = new downloader();
        await ytDownloader.downloadFromFile('playlist.txt', { startIndex, endIndex });


        return selectedVideos;
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        rl.close();
    }
}

// Start the program
getPlaylistDetails();
