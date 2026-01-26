const express = require('express');
const router = express.Router();
const axios = require('axios');

// YouTube API configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyBO1mrYoksmwSJFgOFtSc16b00yWi8cIwk';
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCBkp7FF7Gpy9eA26cgvHPAw'; // forexyy newsletter channel

/**
 * GET /api/youtube/videos
 * Fetch latest videos from YouTube channel (Shorts and regular videos)
 * Query params:
 *   - maxResults: Number of videos to fetch (default: 12)
 *   - type: 'shorts' for only shorts, 'all' for all videos (default: 'all')
 */
router.get('/videos', async (req, res) => {
  try {
    const maxResults = parseInt(req.query.maxResults) || 12;
    const type = req.query.type || 'all';
    const pageToken = req.query.pageToken || '';

    // Step 1: Search for videos from the channel
    const searchUrl = `https://www.googleapis.com/youtube/v3/search`;
    const searchParams = {
      key: YOUTUBE_API_KEY,
      channelId: CHANNEL_ID,
      part: 'snippet',
      order: 'date', // Sort by newest first
      maxResults: maxResults,
      type: 'video', // Only fetch videos
      pageToken: pageToken
    };

    const searchResponse = await axios.get(searchUrl, { params: searchParams });
    const searchResults = searchResponse.data.items || [];
    const nextPageToken = searchResponse.data.nextPageToken || null;

    if (searchResults.length === 0) {
      return res.json({
        success: true,
        videos: [],
        nextPageToken: null,
        message: 'No videos found'
      });
    }

    // Extract video IDs
    const videoIds = searchResults.map(item => item.id.videoId).join(',');

    // Step 2: Get detailed video information including duration
    const videosUrl = `https://www.googleapis.com/youtube/v3/videos`;
    const videosParams = {
      key: YOUTUBE_API_KEY,
      id: videoIds,
      part: 'snippet,contentDetails,statistics'
    };

    const videosResponse = await axios.get(videosUrl, { params: videosParams });
    const videos = videosResponse.data.items || [];

    // Filter for Shorts if requested (duration <= 60 seconds)
    let filteredVideos = videos;
    if (type === 'shorts') {
      filteredVideos = videos.filter(video => {
        const duration = video.contentDetails.duration;
        // Parse ISO 8601 duration (e.g., "PT45S" = 45 seconds)
        const match = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
          const minutes = parseInt(match[1] || 0);
          const seconds = parseInt(match[2] || 0);
          const totalSeconds = minutes * 60 + seconds;
          return totalSeconds <= 60; // Shorts are <= 60 seconds
        }
        return false;
      });
    }

    // Format response
    const formattedVideos = filteredVideos.map(video => ({
      videoId: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      publishedAt: video.snippet.publishedAt,
      thumbnail: {
        default: video.snippet.thumbnails.default?.url,
        medium: video.snippet.thumbnails.medium?.url,
        high: video.snippet.thumbnails.high?.url,
        maxres: video.snippet.thumbnails.maxres?.url
      },
      duration: video.contentDetails.duration,
      viewCount: video.statistics.viewCount,
      likeCount: video.statistics.likeCount,
      commentCount: video.statistics.commentCount,
      embedUrl: `https://www.youtube.com/embed/${video.id}`,
      watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
      shortsUrl: `https://www.youtube.com/shorts/${video.id}`
    }));

    res.json({
      success: true,
      count: formattedVideos.length,
      nextPageToken: nextPageToken,
      videos: formattedVideos
    });

  } catch (error) {
    console.error('YouTube API Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch YouTube videos',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

/**
 * GET /api/youtube/channel
 * Get channel information
 */
router.get('/channel', async (req, res) => {
  try {
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels`;
    const params = {
      key: YOUTUBE_API_KEY,
      id: CHANNEL_ID,
      part: 'snippet,statistics,brandingSettings'
    };

    const response = await axios.get(channelUrl, { params });
    const channel = response.data.items?.[0];

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found'
      });
    }

    res.json({
      success: true,
      channel: {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        customUrl: channel.snippet.customUrl,
        thumbnail: channel.snippet.thumbnails.high?.url,
        subscriberCount: channel.statistics.subscriberCount,
        videoCount: channel.statistics.videoCount,
        viewCount: channel.statistics.viewCount
      }
    });

  } catch (error) {
    console.error('YouTube API Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channel information',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

module.exports = router;
